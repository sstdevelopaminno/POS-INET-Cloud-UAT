import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { normalizeDeviceCode, normalizeStoreCode } from "@/lib/server/login-security";
import { buildRateLimitKey, enforceRateLimit, getClientIpAddress, readRateLimitSetting } from "@/lib/server/rate-limit";
import { cookies } from "next/headers";

type TenantRow = {
  id: string;
  code: string;
  is_active: boolean;
};

type BranchRow = {
  id: string;
  tenant_id: string;
  is_active: boolean;
};

const DEFAULT_TTL_MINUTES = 10;

function resolveExpiryIso() {
  const raw = Number(process.env.POS_LOGIN_CONTEXT_TTL_MINUTES ?? DEFAULT_TTL_MINUTES);
  const ttl = Number.isFinite(raw) && raw > 0 && raw <= 60 ? raw : DEFAULT_TTL_MINUTES;
  return new Date(Date.now() + ttl * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        store_code?: string;
        branch_id?: string;
        device_code?: string | null;
      }
    | null;

  const storeCode = normalizeStoreCode(body?.store_code);
  const branchId = String(body?.branch_id ?? "").trim();
  const requestedDeviceCode = normalizeDeviceCode(body?.device_code);

  const cookieStore = await cookies();
  const deviceCookieName = String(process.env.POS_DEVICE_CODE_COOKIE_NAME ?? "pos_device_code").trim() || "pos_device_code";
  const cookieDeviceCode = normalizeDeviceCode(cookieStore.get(deviceCookieName)?.value ?? null);
  const resolvedDeviceCode = cookieDeviceCode;
  const clientIp = getClientIpAddress(request);

  if (!storeCode) {
    return Response.json({ data: null, error: { code: "store_code_required", message: "store_code is required." } }, { status: 400 });
  }
  if (!branchId) {
    return Response.json({ data: null, error: { code: "branch_id_required", message: "branch_id is required." } }, { status: 400 });
  }

  const rateLimitMax = readRateLimitSetting("POS_STORE_LOGIN_CONTEXT_RATE_LIMIT_MAX", 20, { min: 5, max: 500 });
  const rateLimitWindowSeconds = readRateLimitSetting("POS_PUBLIC_RATE_LIMIT_WINDOW_SECONDS", 60, { min: 10, max: 3_600 });
  const rateLimitKey = buildRateLimitKey({
    namespace: "store:login-context",
    parts: [clientIp, storeCode, branchId, resolvedDeviceCode ?? requestedDeviceCode ?? "no-device"]
  });
  const rateLimitResult = await enforceRateLimit({
    namespace: "login_context",
    key: rateLimitKey,
    max: rateLimitMax,
    windowMs: rateLimitWindowSeconds * 1000
  });
  if (!rateLimitResult.ok) {
    console.warn("[store-login-context] Rate limit exceeded", {
      ipAddress: clientIp,
      storeCode,
      branchId,
      deviceCode: resolvedDeviceCode ?? requestedDeviceCode ?? null,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds
    });
    const limited = Response.json(
      { data: null, error: { code: "rate_limited", message: "Too many requests. Please try again shortly." } },
      { status: 429 }
    );
    limited.headers.set("Retry-After", String(rateLimitResult.retryAfterSeconds));
    return limited;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const [{ data: tenantRow, error: tenantError }, { data: branchRow, error: branchError }] = await Promise.all([
      supabase
        .from("tenants")
        .select("id,code,is_active")
        .eq("code", storeCode)
        .maybeSingle<TenantRow>(),
      supabase
        .from("branches")
        .select("id,tenant_id,is_active")
        .eq("id", branchId)
        .maybeSingle<BranchRow>()
    ]);

    if (tenantError) {
      console.error("[store-login-context] Tenant lookup failed", { storeCode, branchId, error: tenantError.message });
      return Response.json({ data: null, error: { code: "context_create_failed", message: "Unable to prepare login context." } }, { status: 500 });
    }
    if (branchError) {
      console.error("[store-login-context] Branch lookup failed", { storeCode, branchId, error: branchError.message });
      return Response.json({ data: null, error: { code: "context_create_failed", message: "Unable to prepare login context." } }, { status: 500 });
    }
    if (!tenantRow || tenantRow.is_active === false) {
      return Response.json({ data: null, error: { code: "inactive_tenant", message: "Tenant is not active." } }, { status: 403 });
    }
    if (!branchRow || branchRow.is_active === false) {
      return Response.json({ data: null, error: { code: "inactive_branch", message: "Branch is not active." } }, { status: 403 });
    }
    if (branchRow.tenant_id !== tenantRow.id) {
      return Response.json(
        { data: null, error: { code: "branch_tenant_mismatch", message: "Branch does not belong to the provided store." } },
        { status: 403 }
      );
    }

    const expiresAt = resolveExpiryIso();
    const { data: inserted, error: insertError } = await supabase
      .from("pos_login_contexts")
      .insert({
        tenant_id: tenantRow.id,
        branch_id: branchRow.id,
        store_code: tenantRow.code,
        device_code: resolvedDeviceCode,
        expires_at: expiresAt,
        status: "active",
        metadata: {
          requested_device_code: requestedDeviceCode,
          device_cookie_name: deviceCookieName,
          device_source: cookieDeviceCode ? "cookie" : "none"
        }
      })
      .select("id,expires_at")
      .single<{ id: string; expires_at: string }>();

    if (insertError || !inserted) {
      console.error("[store-login-context] Context insert failed", {
        tenantId: tenantRow.id,
        branchId: branchRow.id,
        error: insertError?.message ?? "Unknown insert error"
      });
      return Response.json(
        { data: null, error: { code: "context_create_failed", message: "Unable to prepare login context." } },
        { status: 500 }
      );
    }

    return Response.json({
      data: {
        login_context_id: inserted.id,
        expires_at: inserted.expires_at
      },
      error: null
    });
  } catch (error) {
    console.error("[store-login-context] Unexpected error", {
      storeCode,
      branchId,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return Response.json(
      { data: null, error: { code: "context_create_failed", message: "Unable to prepare login context." } },
      { status: 500 }
    );
  }
}
