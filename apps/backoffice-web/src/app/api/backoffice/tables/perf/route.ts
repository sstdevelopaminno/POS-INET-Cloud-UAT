import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { canManageTables } from "@/lib/table-management";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type PerfEventPayload = {
  event: "load" | "action" | "api";
  label: string;
  durationMs: number;
  status?: number;
  ok?: boolean;
  meta?: Record<string, unknown>;
  at?: string;
};

type PerfRow = {
  event_type: "load" | "action" | "api";
  label: string;
  duration_ms: number;
  status_code: number | null;
  is_ok: boolean | null;
  event_at: string;
};

function clampHours(value: number) {
  if (!Number.isFinite(value)) return 24;
  return Math.min(168, Math.max(1, Math.round(value)));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function toHourKey(iso: string) {
  return iso.slice(0, 13) + ":00:00Z";
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    if (!canManageTables(auth.branchRole)) {
      return fail("forbidden_role", "Only manager or owner can submit table performance events.", 403);
    }

    const body = (await req.json()) as PerfEventPayload;
    if (!body || !["load", "action", "api"].includes(body.event)) {
      return fail("invalid_event", "event must be load, action, or api.", 422);
    }

    const label = String(body.label ?? "").trim().slice(0, 120);
    if (!label) {
      return fail("invalid_label", "label is required.", 422);
    }

    const durationMs = Number(body.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 600000) {
      return fail("invalid_duration", "durationMs must be a finite number between 0 and 600000.", 422);
    }

    const eventAt = typeof body.at === "string" ? new Date(body.at) : null;
    const safeEventAt = eventAt && Number.isFinite(eventAt.valueOf()) ? eventAt.toISOString() : new Date().toISOString();
    const metadata = body.meta && typeof body.meta === "object" ? body.meta : {};

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("table_management_perf_events").insert({
      tenant_id: auth.tenantId!,
      branch_id: auth.branchId!,
      user_id: auth.userId,
      event_type: body.event,
      label,
      duration_ms: durationMs,
      status_code: typeof body.status === "number" && Number.isFinite(body.status) ? Math.trunc(body.status) : null,
      is_ok: typeof body.ok === "boolean" ? body.ok : null,
      event_at: safeEventAt,
      metadata
    });

    if (error) {
      const missingTable = error.code === "42P01" || /table_management_perf_events/i.test(error.message);
      if (missingTable) {
        return ok({
          accepted: false,
          reason: "telemetry_table_unavailable"
        }, 202);
      }
      return fail("perf_event_insert_failed", error.message, 500);
    }

    return ok({ accepted: true }, 201);
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    if (!canManageTables(auth.branchRole)) {
      return fail("forbidden_role", "Only manager or owner can view table performance summary.", 403);
    }

    const { searchParams } = new URL(req.url);
    const hours = clampHours(Number(searchParams.get("hours") ?? 24));
    const slowThresholdMsRaw = Number(searchParams.get("slow_ms") ?? 500);
    const slowThresholdMs = Number.isFinite(slowThresholdMsRaw) ? Math.max(100, Math.min(10000, slowThresholdMsRaw)) : 500;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("table_management_perf_events")
      .select("event_type,label,duration_ms,status_code,is_ok,event_at")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .gte("event_at", since)
      .order("event_at", { ascending: true });

    if (error) {
      const missingTable = error.code === "42P01" || /table_management_perf_events/i.test(error.message);
      if (missingTable) {
        return ok({
          windowHours: hours,
          slowThresholdMs,
          totals: {
            totalEvents: 0,
            apiEvents: 0,
            actionEvents: 0,
            loadEvents: 0,
            slowApiEvents: 0,
            failedApiEvents: 0
          },
          latency: {
            avgApiMs: 0,
            p50ApiMs: 0,
            p95ApiMs: 0,
            maxApiMs: 0
          },
          topLabelsByAvgLatency: [],
          hourly: [],
          telemetryReady: false
        });
      }
      return fail("perf_summary_query_failed", error.message, 500);
    }

    const rows = (data ?? []) as PerfRow[];
    const apiRows = rows.filter((row) => row.event_type === "api");
    const actionRows = rows.filter((row) => row.event_type === "action");
    const loadRows = rows.filter((row) => row.event_type === "load");
    const apiDurations = apiRows.map((row) => Number(row.duration_ms));
    const slowRows = apiRows.filter((row) => Number(row.duration_ms) >= slowThresholdMs);
    const failedApiRows = apiRows.filter((row) => row.is_ok === false || (row.status_code ?? 200) >= 400);

    const byLabel = new Map<string, { count: number; slowCount: number; failedCount: number; totalDuration: number; maxDuration: number }>();
    for (const row of apiRows) {
      const key = row.label;
      const current = byLabel.get(key) ?? { count: 0, slowCount: 0, failedCount: 0, totalDuration: 0, maxDuration: 0 };
      const duration = Number(row.duration_ms);
      current.count += 1;
      current.totalDuration += duration;
      current.maxDuration = Math.max(current.maxDuration, duration);
      if (duration >= slowThresholdMs) current.slowCount += 1;
      if (row.is_ok === false || (row.status_code ?? 200) >= 400) current.failedCount += 1;
      byLabel.set(key, current);
    }

    const labelSummary = [...byLabel.entries()]
      .map(([label, value]) => ({
        label,
        count: value.count,
        avgMs: value.count > 0 ? Number((value.totalDuration / value.count).toFixed(2)) : 0,
        maxMs: Number(value.maxDuration.toFixed(2)),
        slowCount: value.slowCount,
        failedCount: value.failedCount
      }))
      .sort((left, right) => right.avgMs - left.avgMs)
      .slice(0, 10);

    const bucketMap = new Map<string, { total: number; apiCount: number; slowCount: number; failedCount: number; avgDurationAccumulator: number }>();
    for (let i = hours - 1; i >= 0; i -= 1) {
      const hour = new Date(Date.now() - i * 60 * 60 * 1000).toISOString().slice(0, 13) + ":00:00Z";
      bucketMap.set(hour, { total: 0, apiCount: 0, slowCount: 0, failedCount: 0, avgDurationAccumulator: 0 });
    }

    for (const row of rows) {
      const key = toHourKey(row.event_at);
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (row.event_type === "api") {
        const duration = Number(row.duration_ms);
        bucket.apiCount += 1;
        bucket.avgDurationAccumulator += duration;
        if (duration >= slowThresholdMs) bucket.slowCount += 1;
        if (row.is_ok === false || (row.status_code ?? 200) >= 400) bucket.failedCount += 1;
      }
    }

    const hourly = [...bucketMap.entries()].map(([hour, value]) => ({
      hour,
      totalEvents: value.total,
      apiCount: value.apiCount,
      slowCount: value.slowCount,
      failedCount: value.failedCount,
      avgApiMs: value.apiCount > 0 ? Number((value.avgDurationAccumulator / value.apiCount).toFixed(2)) : 0
    }));

    return ok({
      windowHours: hours,
      slowThresholdMs,
      totals: {
        totalEvents: rows.length,
        apiEvents: apiRows.length,
        actionEvents: actionRows.length,
        loadEvents: loadRows.length,
        slowApiEvents: slowRows.length,
        failedApiEvents: failedApiRows.length
      },
      latency: {
        avgApiMs: apiDurations.length > 0 ? Number((apiDurations.reduce((sum, value) => sum + value, 0) / apiDurations.length).toFixed(2)) : 0,
        p50ApiMs: Number(percentile(apiDurations, 50).toFixed(2)),
        p95ApiMs: Number(percentile(apiDurations, 95).toFixed(2)),
        maxApiMs: Number((apiDurations.length > 0 ? Math.max(...apiDurations) : 0).toFixed(2))
      },
      topLabelsByAvgLatency: labelSummary,
      hourly,
      telemetryReady: true
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
