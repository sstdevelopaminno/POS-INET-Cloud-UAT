import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { resolveTableBranchScope } from "@/lib/table-branch-scope";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type ZoneUpdatePayload = {
  branch_id?: string;
  zone_name?: string;
  color?: string;
  display_order?: number;
  is_active?: boolean;
};

export async function PATCH(req: Request, context: { params: Promise<{ zoneId: string }> }) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const { zoneId } = await context.params;
    if (!zoneId) {
      return fail("invalid_zone_id", "zoneId is required.", 422);
    }

    const body = (await req.json()) as ZoneUpdatePayload;
    const supabase = getSupabaseServiceClient();
    const branchScope = await resolveTableBranchScope({
      auth,
      requestedBranchId: body.branch_id,
      requireManage: true,
      supabaseClient: supabase
    });
    if (!branchScope.ok) {
      return fail(branchScope.code, branchScope.message, branchScope.status);
    }
    const targetBranchId = branchScope.targetBranchId!;
    const targetRole = branchScope.branches.find((branch) => branch.id === targetBranchId)?.role ?? auth.branchRole;
    const updatePayload: Record<string, unknown> = {};
    if (typeof body.zone_name === "string") updatePayload.zone_name = body.zone_name.trim();
    if (typeof body.color === "string") updatePayload.color = body.color.trim();
    if (typeof body.display_order === "number") updatePayload.display_order = body.display_order;
    if (typeof body.is_active === "boolean") updatePayload.is_active = body.is_active;

    if (Object.keys(updatePayload).length === 0) {
      return fail("invalid_payload", "No updatable fields provided.", 422);
    }

    const { data, error } = await supabase
      .from("table_zones")
      .update(updatePayload)
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", targetBranchId)
      .eq("id", zoneId)
      .select("id,tenant_id,branch_id,zone_name,color,display_order,is_active,metadata,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return fail("zone_update_failed", error.message, 500);
    }
    if (!data) {
      return fail("zone_not_found", "Zone not found in current branch.", 404);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "table_zone_updated",
      targetTable: "table_zones",
      targetId: data.id,
      metadata: updatePayload
    });

    return ok(data);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ zoneId: string }> }) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const { zoneId } = await context.params;
    if (!zoneId) {
      return fail("invalid_zone_id", "zoneId is required.", 422);
    }

    const supabase = getSupabaseServiceClient();
    const url = new URL(_req.url);
    const branchScope = await resolveTableBranchScope({
      auth,
      requestedBranchId: url.searchParams.get("branch_id"),
      requireManage: true,
      supabaseClient: supabase
    });
    if (!branchScope.ok) {
      return fail(branchScope.code, branchScope.message, branchScope.status);
    }
    const targetBranchId = branchScope.targetBranchId!;
    const targetRole = branchScope.branches.find((branch) => branch.id === targetBranchId)?.role ?? auth.branchRole;
    const { count: linkedTableCount, error: countError } = await supabase
      .from("dining_tables")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", targetBranchId)
      .eq("zone_id", zoneId);

    if (countError) {
      return fail("zone_usage_check_failed", countError.message, 500);
    }
    if ((linkedTableCount ?? 0) > 0) {
      return fail("zone_in_use", "Cannot delete zone while tables are assigned to it.", 409);
    }

    const { data, error } = await supabase
      .from("table_zones")
      .delete()
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", targetBranchId)
      .eq("id", zoneId)
      .select("id,zone_name")
      .maybeSingle();

    if (error) {
      return fail("zone_delete_failed", error.message, 500);
    }
    if (!data) {
      return fail("zone_not_found", "Zone not found in current branch.", 404);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "table_zone_deleted",
      targetTable: "table_zones",
      targetId: data.id,
      metadata: {
        zone_name: data.zone_name
      }
    });

    return ok({ id: data.id, deleted: true });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
