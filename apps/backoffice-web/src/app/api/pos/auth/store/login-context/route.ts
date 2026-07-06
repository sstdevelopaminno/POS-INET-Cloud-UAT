import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const DEFAULT_DEVICE_COOKIE_NAME = "pos_device_code";

function normalizeDeviceCode(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (!/^[A-Z0-9._:-]{3,64}$/.test(normalized)) return null;
  return normalized;
}

function resolveDeviceCookieName() {
  return String(process.env.POS_DEVICE_CODE_COOKIE_NAME ?? DEFAULT_DEVICE_COOKIE_NAME).trim() || DEFAULT_DEVICE_COOKIE_NAME;
}

function resolveCookieSecure() {
  const secureEnv = String(process.env.POS_SESSION_COOKIE_SECURE ?? "").trim().toLowerCase();
  if (!secureEnv) return process.env.NODE_ENV === "production";
  return secureEnv === "1" || secureEnv === "true";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        store_code?: string;
        branch_id?: string;
        device_code?: string | null;
      }
    | null;

  const storeCode = String(body?.store_code ?? "").trim().toUpperCase();
  const branchId = String(body?.branch_id ?? "").trim();
  if (!storeCode) {
    return NextResponse.json({ data: null, error: { code: "store_code_required", message: "store_code is required." } }, { status: 400 });
  }
  if (!branchId) {
    return NextResponse.json({ data: null, error: { code: "branch_id_required", message: "branch_id is required." } }, { status: 400 });
  }

  const cookieStore = await cookies();
  const deviceCookieName = resolveDeviceCookieName();
  const cookieDeviceCode = normalizeDeviceCode(cookieStore.get(deviceCookieName)?.value ?? null);
  const requestedDeviceCode = normalizeDeviceCode(body?.device_code ?? null);
  const resolvedDeviceCode = cookieDeviceCode ?? requestedDeviceCode;

  try {
    const forwardedCookieParts: string[] = [];
    if (resolvedDeviceCode) {
      forwardedCookieParts.push(`${encodeURIComponent(deviceCookieName)}=${encodeURIComponent(resolvedDeviceCode)}`);
    }

    const localUrl = new URL("/api/store/login-context", request.url);
    const response = await fetch(localUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwardedCookieParts.length > 0 ? { Cookie: forwardedCookieParts.join("; ") } : {})
      },
      body: JSON.stringify({
        store_code: storeCode,
        branch_id: branchId
      }),
      cache: "no-store"
    });

    const payload = await response.json().catch(() => null);
    const out = NextResponse.json(payload, { status: response.status });
    if (resolvedDeviceCode) {
      out.cookies.set({
        name: deviceCookieName,
        value: resolvedDeviceCode,
        httpOnly: true,
        sameSite: "lax",
        secure: resolveCookieSecure(),
        path: "/",
        maxAge: 60 * 60 * 24 * 30
      });
    }
    return out;
  } catch (error) {
    console.error("[pos-auth-login-context] proxy failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { data: null, error: { code: "context_create_failed", message: "Unable to prepare login context." } },
      { status: 500 }
    );
  }
}
