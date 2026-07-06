import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { floorObjectTypes } from "@/lib/table-management";
import { resolveTableBranchScope } from "@/lib/table-branch-scope";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type FloorObjectUpdatePayload = {
  branch_id?: string;
  zone_id?: string | null;
  object_type?: string;
  object_name?: string | null;
  color?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  z_index?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

export async function PATCH(req: Request, context: { params: Promise<{ objectId: string }> }) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const { objectId } = await context.params;
    if (!objectId) {
      return fail("invalid_object_id", "objectId is required.", 422);
    }

    const body = (await req.json()) as FloorObjectUpdatePayload;
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

    if (body.zone_id !== undefined) updatePayload.zone_id = body.zone_id;
    if (typeof body.object_type === "string" && floorObjectTypes.includes(body.object_type as (typeof floorObjectTypes)[number])) {
      updatePayload.object_type = body.object_type;
    }
    if (body.object_name !== undefined) updatePayload.object_name = body.object_name?.trim() || null;
    if (typeof body.color === "string") updatePayload.color = body.color.trim();
    if (typeof body.position_x === "number") updatePayload.position_x = body.position_x;
    if (typeof body.position_y === "number") updatePayload.position_y = body.position_y;
    if (typeof body.width === "number") updatePayload.width = Math.max(24, body.width);
    if (typeof body.height === "number") updatePayload.height = Math.max(24, body.height);
    if (typeof body.rotation === "number") updatePayload.rotation = body.rotation;
    if (typeof body.z_index === "number") updatePayload.z_index = Math.max(1, Math.trunc(body.z_index));
    if (typeof body.is_active === "boolean") updatePayload.is_active = body.is_active;
    if (body.metadata && typeof body.metadata === "object") updatePayload.metadata = body.metadata;

    if (Object.keys(updatePayload).length === 0) {
      return fail("invalid_payload", "No updatable fields provided.", 422);
    }

    if (body.zone_id !== undefined && body.zone_id !== null) {
      const { data: zone, error: zoneError } = await supabase
        .from("table_zones")
        .select("id")
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", targetBranchId)
        .eq("id", body.zone_id)
        .maybeSingle();
      if (zoneError) {
        return fail("zone_lookup_failed", zoneError.message, 500);
      }
      if (!zone) {
        return fail("invalid_zone_id", "zone_id is not available in current branch.", 422);
      }
    }

    const { data, error } = await supabase
      .from("table_layout_objects")
      .update(updatePayload)
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", targetBranchId)
      .eq("id", objectId)
      .select(
        "id,tenant_id,branch_id,zone_id,object_type,object_name,color,position_x,position_y,width,height,rotation,z_index,is_active,metadata,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      return fail("layout_object_update_failed", error.message, 500);
    }
    if (!data) {
      return fail("layout_object_not_found", "Floor object not found in current branch.", 404);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "floor_object_updated",
      targetTable: "table_layout_objects",
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

export async function DELETE(_req: Request, context: { params: Promise<{ objectId: string }> }) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const { objectId } = await context.params;
    if (!objectId) {
      return fail("invalid_object_id", "objectId is required.", 422);
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
    const { data, error } = await supabase
      .from("table_layout_objects")
      .delete()
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", targetBranchId)
      .eq("id", objectId)
      .select("id,object_type,object_name")
      .maybeSingle();

    if (error) {
      return fail("layout_object_delete_failed", error.message, 500);
    }
    if (!data) {
      return fail("layout_object_not_found", "Floor object not found in current branch.", 404);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "floor_object_deleted",
      targetTable: "table_layout_objects",
      targetId: data.id,
      metadata: {
        object_type: data.object_type,
        object_name: data.object_name
      }
    });

    return ok({ id: data.id, deleted: true });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
