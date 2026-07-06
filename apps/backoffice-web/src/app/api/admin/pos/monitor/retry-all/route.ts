import { appendAuditLog } from "@/lib/audit-log";
import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { POS_GUARDS } from "@/lib/pos-resilience";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type RetryQueueType = "order" | "payment";

type RetryRequest = {
  queue?: RetryQueueType;
  branch_id?: string | null;
};

function canManageRetry(role: string | null): boolean {
  return role === "owner" || role === "manager";
}

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("undefined column") || normalized.includes("pgrst");
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const auth = await getAuthContext({ requireBranchScope: false });
    if (!auth.tenantId) {
      const response = fail("missing_tenant_scope", "Tenant scope is required.", 401);
      response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
      return response;
    }

    const body = (await req.json().catch(() => ({}))) as RetryRequest;
    const queue = body.queue;
    const requestedBranchId = body.branch_id ? String(body.branch_id) : null;
    if (queue !== "order" && queue !== "payment") {
      const response = fail("invalid_queue", "queue must be order or payment.", 422);
      response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
      return response;
    }

    const supabase = getSupabaseServiceClient();
    const { data: branchRoles, error: branchRolesError } = await supabase
      .from("user_branch_roles")
      .select("branch_id,role")
      .eq("tenant_id", auth.tenantId)
      .eq("user_id", auth.userId);

    if (branchRolesError) {
      const response = fail("branch_roles_query_failed", branchRolesError.message, 500);
      response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
      return response;
    }

    const manageableBranchIds = (branchRoles ?? [])
      .filter((row) => canManageRetry(typeof row.role === "string" ? row.role : null))
      .map((row) => String(row.branch_id))
      .filter(Boolean);

    const uniqueManageableBranchIds = [...new Set(manageableBranchIds)];
    if (uniqueManageableBranchIds.length === 0) {
      const response = fail("forbidden", "Owner/manager role is required.", 403);
      response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
      return response;
    }

    const targetBranchIds = requestedBranchId ? [requestedBranchId] : uniqueManageableBranchIds;
    const isAllowed = targetBranchIds.every((branchId) => uniqueManageableBranchIds.includes(branchId));
    if (!isAllowed) {
      const response = fail("forbidden_branch_scope", "You do not have permission for this branch.", 403);
      response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
      return response;
    }

    const staleSinceIso = new Date(Date.now() - POS_GUARDS.staleQueuedMinutes * 60_000).toISOString();
    const deadLetterSinceIso = new Date(Date.now() - POS_GUARDS.deadLetterWindowMinutes * 60_000).toISOString();
    const touchedAtIso = new Date().toISOString();
    let affectedCount = 0;
    let requestedIncidents = 0;

    if (queue === "order") {
      for (const branchId of targetBranchIds) {
        const { count, error } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", auth.tenantId)
          .eq("branch_id", branchId)
          .eq("status", "queued")
          .lt("created_at", staleSinceIso);
        if (error) {
          const response = fail("order_retry_count_failed", error.message, 500);
          response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
          return response;
        }
        const branchAffected = count ?? 0;
        affectedCount += branchAffected;

        const { error: touchError } = await supabase
          .from("orders")
          .update({ updated_at: touchedAtIso })
          .eq("tenant_id", auth.tenantId)
          .eq("branch_id", branchId)
          .eq("status", "queued")
          .lt("created_at", staleSinceIso);
        if (touchError) {
          const response = fail("order_retry_touch_failed", touchError.message, 500);
          response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
          return response;
        }

        await appendAuditLog({
          tenantId: auth.tenantId,
          branchId,
          actorUserId: auth.userId,
          actorRole: auth.branchRole ?? auth.platformRole,
          action: "pos_order_retry_all_requested",
          targetTable: "orders",
          metadata: {
            stale_cutoff: staleSinceIso,
            affected_orders: branchAffected
          }
        });
      }
    } else {
      for (const branchId of targetBranchIds) {
        const { count, error } = await supabase
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", auth.tenantId)
          .eq("branch_id", branchId)
          .eq("action", "pos_payment_dead_letter")
          .gt("created_at", deadLetterSinceIso);
        if (error) {
          const response = fail("payment_retry_count_failed", error.message, 500);
          response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
          return response;
        }
        const branchRequested = count ?? 0;
        requestedIncidents += branchRequested;

        const { data: paidOrders, error: paidOrdersError } = await supabase
          .from("orders")
          .select("id,total_amount,cash_received")
          .eq("tenant_id", auth.tenantId)
          .eq("branch_id", branchId)
          .eq("status", "completed")
          .is("payment_completed_at", null)
          .order("updated_at", { ascending: false })
          .limit(200);
        if (paidOrdersError && !isSchemaMissingError(paidOrdersError.message)) {
          const response = fail("payment_retry_query_failed", paidOrdersError.message, 500);
          response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
          return response;
        }

        for (const orderRow of paidOrders ?? []) {
          const { data: payments, error: paymentsError } = await supabase
            .from("payments")
            .select("amount,received_at")
            .eq("tenant_id", auth.tenantId)
            .eq("branch_id", branchId)
            .eq("order_id", String(orderRow.id));
          if (paymentsError) {
            continue;
          }
          if (!payments || payments.length === 0) {
            continue;
          }
          const totalReceived = Number(payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2));
          const totalDue = Number(Number(orderRow.total_amount ?? 0).toFixed(2));
          const effectiveReceived = Number(orderRow.cash_received ?? totalReceived);
          const changeAmount = Number(Math.max(0, effectiveReceived - totalDue).toFixed(2));
          const latestReceivedAt =
            payments
              .map((row) => new Date(String(row.received_at ?? touchedAtIso)).getTime())
              .filter((value) => Number.isFinite(value))
              .sort((a, b) => b - a)[0] ?? Date.now();

          const { error: healError } = await supabase
            .from("orders")
            .update({
              cash_received: effectiveReceived,
              change_amount: changeAmount,
              payment_completed_at: new Date(latestReceivedAt).toISOString(),
              payment_completed_by: auth.userId
            })
            .eq("tenant_id", auth.tenantId)
            .eq("branch_id", branchId)
            .eq("id", String(orderRow.id));
          if (!healError) {
            affectedCount += 1;
          }
        }

        await appendAuditLog({
          tenantId: auth.tenantId,
          branchId,
          actorUserId: auth.userId,
          actorRole: auth.branchRole ?? auth.platformRole,
          action: "pos_payment_retry_all_requested",
          targetTable: "payments",
          metadata: {
            window_minutes: POS_GUARDS.deadLetterWindowMinutes,
            requested_incidents: branchRequested
          }
        });
      }
    }

    const response = ok({
      queue,
      tenant_id: auth.tenantId,
      branch_ids: targetBranchIds,
      affected_count: affectedCount,
      requested_incidents: requestedIncidents,
      requested_at: touchedAtIso
    });
    response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
    return response;
  } catch (error) {
    const response = fail("admin_pos_retry_all_failed", error instanceof Error ? error.message : "Unknown error", 500);
    response.headers.set("x-admin-pos-retry-all-ms", String(Date.now() - startedAt));
    return response;
  }
}
