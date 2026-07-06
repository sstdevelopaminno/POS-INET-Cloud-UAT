import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { invalidatePosScopeRuntimeCaches } from "@/lib/pos-cache-invalidation";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type MoveBillPayload = {
  target_table_id: string;
  reason?: string;
};

export async function POST(req: Request, context: { params: Promise<{ tableId: string }> }) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "tables:manage" });
    await requirePosApiFeature(auth, "table_management");
    const { tableId } = await context.params;
    if (!tableId) {
      return fail("invalid_table_id", "tableId is required.", 422);
    }

    const body = (await req.json()) as MoveBillPayload;
    if (!body.target_table_id) {
      return fail("invalid_target_table_id", "target_table_id is required.", 422);
    }
    if (body.target_table_id === tableId) {
      return fail("same_table_move_not_allowed", "Target table must be different from source table.", 422);
    }

    const supabase = getSupabaseServiceClient();
    const { data: sourceSession, error: sourceSessionError } = await supabase
      .from("table_bill_sessions")
      .select("id,order_id,status")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("table_id", tableId)
      .in("status", ["open", "ordering", "pending_payment"])
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; order_id: string | null; status: string }>();

    if (sourceSessionError) {
      return fail("source_session_query_failed", sourceSessionError.message, 500);
    }
    if (!sourceSession) {
      return fail("source_bill_not_found", "No active bill on source table.", 409);
    }

    const { data: targetActiveSession, error: targetSessionError } = await supabase
      .from("table_bill_sessions")
      .select("id")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("table_id", body.target_table_id)
      .in("status", ["open", "ordering", "pending_payment"])
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (targetSessionError) {
      return fail("target_session_query_failed", targetSessionError.message, 500);
    }
    if (targetActiveSession) {
      return fail("target_table_occupied", "Target table already has an active bill.", 409);
    }

    if (sourceSession.order_id) {
      const { data: updatedOrder, error: orderUpdateError } = await supabase
        .from("orders")
        .update({ table_id: body.target_table_id })
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .eq("id", sourceSession.order_id)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (orderUpdateError) {
        return fail("table_move_order_update_failed", orderUpdateError.message, 500);
      }
      if (!updatedOrder) {
        return fail("table_move_order_not_found", "Active bill order was not found for this branch.", 404);
      }
    }

    const targetSessionStatus =
      sourceSession.status === "pending_payment" ? "pending_payment" : sourceSession.status === "ordering" ? "ordering" : "open";

    const closedAt = new Date().toISOString();
    const { error: closeSourceError } = await supabase
      .from("table_bill_sessions")
      .update({ status: "closed", closed_by: auth.userId, closed_at: closedAt })
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("id", sourceSession.id);
    if (closeSourceError) {
      return fail("source_session_close_failed", closeSourceError.message, 500);
    }

    const { data: targetSession, error: targetInsertError } = await supabase
      .from("table_bill_sessions")
      .insert({
        tenant_id: auth.tenantId,
        branch_id: auth.branchId,
        table_id: body.target_table_id,
        opened_by: auth.userId,
        order_id: sourceSession.order_id,
        status: targetSessionStatus,
        metadata: {
          moved_from_table_id: tableId,
          move_reason: body.reason?.trim() || null
        }
      })
      .select("id")
      .single<{ id: string }>();

    if (targetInsertError) {
      return fail("target_session_create_failed", targetInsertError.message, 500);
    }

    const { error: sourceTableStatusError } = await supabase
      .from("dining_tables")
      .update({ status: "available" })
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("id", tableId);
    if (sourceTableStatusError) {
      return fail("source_table_status_update_failed", sourceTableStatusError.message, 500);
    }

    const { error: targetTableStatusError } = await supabase
      .from("dining_tables")
      .update({
        status:
          targetSessionStatus === "pending_payment"
            ? "pending_payment"
            : targetSessionStatus === "ordering"
            ? "ordering"
            : "occupied"
      })
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("id", body.target_table_id);
    if (targetTableStatusError) {
      return fail("target_table_status_update_failed", targetTableStatusError.message, 500);
    }

    void appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: auth.branchId!,
      actorUserId: auth.userId,
      actorRole: auth.branchRole ?? auth.platformRole,
      action: "table_changed",
      targetTable: sourceSession.order_id ? "orders" : "table_bill_sessions",
      targetId: sourceSession.order_id ?? sourceSession.id,
      metadata: {
        from_table_id: tableId,
        to_table_id: body.target_table_id,
        target_session_id: targetSession.id,
        reason: body.reason?.trim() || null
      }
    }).catch(() => undefined);

    invalidatePosScopeRuntimeCaches({ tenantId: auth.tenantId!, branchId: auth.branchId! });
    return ok({
      order_id: sourceSession.order_id,
      from_table_id: tableId,
      to_table_id: body.target_table_id,
      target_session_id: targetSession.id
    });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("table_move_failed", error instanceof Error ? error.message : "Unknown error", 400);
  }
}
