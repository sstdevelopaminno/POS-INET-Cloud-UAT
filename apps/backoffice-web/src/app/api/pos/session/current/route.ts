import { NextResponse } from "next/server";
import {
  PosGuardError,
  requirePosSession,
  updateCachedPosSessionShift,
  withPosSessionCookie
} from "@/lib/pos-session-guard";
import { loadPosRuntimeDevicePolicyForSession } from "@/lib/pos-device-status";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

async function withQueryTimeout<T>(queryPromise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T | null>([
      queryPromise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isMissingSessionShiftColumnError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  if (error.code === "42703") return true;
  if (message.includes("pos_sessions.shift_id") || message.includes("column shift_id")) return true;
  return message.includes("could not find the 'shift_id' column");
}

function isMissingShiftDeviceCodeColumnError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  if (error.code === "42703") return true;
  if (message.includes("shifts.device_code") || message.includes("column device_code")) return true;
  return message.includes("could not find the 'device_code' column");
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const scope = await requirePosSession();
    const supabase = getSupabaseServiceClient();
    const devicePolicyPromise = loadPosRuntimeDevicePolicyForSession(scope.session);

    const shiftId = scope.session.shift_id;
    let shiftSummary: { id: string; status: string; opened_at: string; closed_at: string | null } | null = null;
    let shiftLookupFallback = false;
    let reboundShiftBinding = false;
    if (shiftId) {
      const shiftQuery = supabase
        .from("shifts")
        .select("id,status,opened_at,closed_at")
        .eq("id", shiftId)
        .eq("tenant_id", scope.session.tenant_id)
        .eq("branch_id", scope.session.branch_id)
        .maybeSingle<{ id: string; status: string; opened_at: string; closed_at: string | null }>();
      const shiftResult = await withQueryTimeout(
        Promise.resolve(shiftQuery) as Promise<{ data: { id: string; status: string; opened_at: string; closed_at: string | null } | null }>,
        3500
      );
      if (!shiftResult) {
        shiftLookupFallback = true;
      } else {
        shiftSummary = shiftResult.data ?? null;
      }
    }

    if (!shiftSummary && !shiftId) {
      let activeShiftQuery = supabase
        .from("shifts")
        .select("id,status,opened_at,closed_at")
        .eq("tenant_id", scope.session.tenant_id)
        .eq("branch_id", scope.session.branch_id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1);
      if (scope.session.device_code) {
        activeShiftQuery = activeShiftQuery.eq("device_code", scope.session.device_code);
      }
      let activeShiftResult = await withQueryTimeout(
        Promise.resolve(activeShiftQuery.maybeSingle<{ id: string; status: string; opened_at: string; closed_at: string | null }>()) as Promise<{
          data: { id: string; status: string; opened_at: string; closed_at: string | null } | null;
          error?: { code?: string; message?: string } | null;
        }>,
        2500
      );
      if (isMissingShiftDeviceCodeColumnError(activeShiftResult?.error)) {
        activeShiftResult = await withQueryTimeout(
          Promise.resolve(
            supabase
              .from("shifts")
              .select("id,status,opened_at,closed_at")
              .eq("tenant_id", scope.session.tenant_id)
              .eq("branch_id", scope.session.branch_id)
              .eq("status", "open")
              .order("opened_at", { ascending: false })
              .limit(1)
              .maybeSingle<{ id: string; status: string; opened_at: string; closed_at: string | null }>()
          ) as Promise<{
            data: { id: string; status: string; opened_at: string; closed_at: string | null } | null;
            error?: { code?: string; message?: string } | null;
          }>,
          2500
        );
      }
      if (!activeShiftResult) {
        shiftLookupFallback = true;
      } else if (activeShiftResult.data?.id) {
        shiftSummary = activeShiftResult.data;
        const { error: bindError } = await supabase.from("pos_sessions").update({ shift_id: shiftSummary.id }).eq("id", scope.session.id);
        if (!bindError || isMissingSessionShiftColumnError(bindError)) {
          reboundShiftBinding = true;
          updateCachedPosSessionShift(scope.session.id, shiftSummary.id);
        }
      }
    }

    if (!shiftSummary && shiftId && shiftLookupFallback) {
      shiftSummary = {
        id: shiftId,
        status: "open",
        opened_at: new Date().toISOString(),
        closed_at: null
      };
    }

    const devicePolicy = await devicePolicyPromise;
    const response = NextResponse.json({
      data: {
        session: {
          id: scope.session.id,
          status: scope.session.status,
          expires_at: scope.session.expires_at
        },
        tenant: {
          id: scope.session.tenant_id,
          code: scope.tenant?.code ?? null,
          name: scope.tenant?.name ?? null
        },
        branch: {
          id: scope.session.branch_id,
          code: scope.branch?.code ?? null,
          name: scope.branch?.name ?? null
        },
        user: {
          id: scope.session.user_id,
          full_name: scope.user.full_name ?? scope.session.user_id
        },
        role: scope.session.role,
        permissions: scope.permissions,
        device: {
          id: scope.session.device_id,
          code: scope.session.device_code,
          name: devicePolicy.name,
          status: devicePolicy.status,
          block_sales: devicePolicy.block_sales,
          reason_code: devicePolicy.reason_code
        },
        shift: shiftSummary,
        has_active_shift: shiftSummary?.status === "open"
      },
      error: null
    });

    response.headers.set("x-pos-session-shift-fallback", shiftLookupFallback ? "1" : "0");
    response.headers.set("x-pos-session-shift-rebound", reboundShiftBinding ? "1" : "0");
    const durationMs = Date.now() - startedAt;
    response.headers.set("x-pos-api-ms", String(durationMs));
    response.headers.set("server-timing", `total;dur=${durationMs}`);
    return withPosSessionCookie(response, scope.session.id);
  } catch (error) {
    if (error instanceof PosGuardError) {
      const response = NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
      const durationMs = Date.now() - startedAt;
      response.headers.set("x-pos-api-ms", String(durationMs));
      response.headers.set("server-timing", `total;dur=${durationMs}`);
      return response;
    }
    console.error("[pos-session-current] unexpected error", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    const response = NextResponse.json(
      { data: null, error: { code: "pos_session_current_failed", message: "Unable to load POS session." } },
      { status: 500 }
    );
    const durationMs = Date.now() - startedAt;
    response.headers.set("x-pos-api-ms", String(durationMs));
    response.headers.set("server-timing", `total;dur=${durationMs}`);
    return response;
  }
}
