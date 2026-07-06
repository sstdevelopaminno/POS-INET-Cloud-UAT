import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { fail, ok } from "@/lib/http";
import { invalidatePosScopeRuntimeCaches } from "@/lib/pos-cache-invalidation";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { openTableBillSession } from "@/lib/services/table-service";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type OpenBillPayload = {
  note?: string;
};

const OPEN_SHIFT_CACHE_TTL_MS = 15_000;
const openShiftByScopeCache = new Map<string, { shiftId: string; expiresAt: number }>();

function formatOpenBillPerfHeader(perf: Record<string, number>): string {
  const entries = Object.entries(perf).filter(([, value]) => Number.isFinite(value) && value >= 0);
  if (entries.length === 0) return "";
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Math.round(value)}`)
    .join(",");
}

export async function POST(req: Request, context: { params: Promise<{ tableId: string }> }) {
  const startedAt = Date.now();
  const withTiming = (response: Response, perf?: Record<string, number>) => {
    response.headers.set("x-pos-open-bill-ms", String(Date.now() - startedAt));
    const perfHeader = perf ? formatOpenBillPerfHeader(perf) : "";
    if (perfHeader) {
      response.headers.set("x-pos-open-bill-breakdown", perfHeader);
    }
    return response;
  };
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "tables:manage" });
    await requirePosApiFeature(auth, "table_management");
    const { tableId } = await context.params;
    if (!tableId) {
      return withTiming(fail("invalid_table_id", "tableId is required.", 422));
    }

    const openBillPerf: Record<string, number> = {};
    const now = Date.now();
    const scopeKey = `${auth.tenantId}:${auth.branchId}`;
    const cachedOpenShift = openShiftByScopeCache.get(scopeKey);
    let openShiftId: string | null = null;

    if (cachedOpenShift && cachedOpenShift.expiresAt > now) {
      openShiftId = cachedOpenShift.shiftId;
      openBillPerf.shift_cache_hit_ms = 0;
    } else {
      const shiftQueryStartedAt = Date.now();
      const supabase = getSupabaseServiceClient();
      const { data: openShift, error: shiftError } = await supabase
        .from("shifts")
        .select("id")
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      openBillPerf.shift_query_ms = Date.now() - shiftQueryStartedAt;

      if (shiftError) {
        return withTiming(fail("shift_query_failed", shiftError.message, 500), openBillPerf);
      }
      if (!openShift) {
        openShiftByScopeCache.delete(scopeKey);
        return withTiming(fail("shift_not_open", "Open shift is required before opening table bill.", 409), openBillPerf);
      }
      openShiftId = openShift.id;
      openShiftByScopeCache.set(scopeKey, { shiftId: openShift.id, expiresAt: now + OPEN_SHIFT_CACHE_TTL_MS });
    }

    const body = (await req.json().catch(() => ({}))) as OpenBillPayload;
    if (!openShiftId) {
      return withTiming(fail("shift_not_open", "Open shift is required before opening table bill.", 409), openBillPerf);
    }
    const result = await openTableBillSession({
      auth,
      tableId,
      metadata: {
        note: body.note?.trim() || null,
        opened_shift_id: openShiftId
      }
    });
    Object.assign(openBillPerf, result.perf);

    if (!result.ok) {
      return withTiming(fail(result.code, result.message, result.status), openBillPerf);
    }

    invalidatePosScopeRuntimeCaches({ tenantId: auth.tenantId!, branchId: auth.branchId! });
    return withTiming(ok({
      ...result.data,
      shift_id: openShiftId
    }, 201), openBillPerf);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return withTiming(featureError);
    return withTiming(fail("open_bill_failed", error instanceof Error ? error.message : "Unknown error", 400));
  }
}
