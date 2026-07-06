import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { resolveTableBranchScope } from "@/lib/table-branch-scope";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type FloorPlanTablePatch = {
  id: string;
  zone_id?: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
};

type FloorPlanObjectPatch = {
  id: string;
  zone_id?: string | null;
  object_type?: string;
  object_name?: string | null;
  color?: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  z_index?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

type SavePayload = {
  branch_id?: string;
  tables: FloorPlanTablePatch[];
  objects?: FloorPlanObjectPatch[];
  reset?: boolean;
};

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const body = (await req.json()) as SavePayload;
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
    if (!Array.isArray(body.tables)) {
      return fail("invalid_payload", "tables array is required.", 422);
    }

    const patches = body.tables.map((table) => ({
      id: table.id,
      zone_id: table.zone_id ?? null,
      position_x: body.reset ? 0 : Number(table.position_x ?? 0),
      position_y: body.reset ? 0 : Number(table.position_y ?? 0),
      width: body.reset ? 96 : Math.max(40, Number(table.width ?? 96)),
      height: body.reset ? 72 : Math.max(40, Number(table.height ?? 72)),
      rotation: body.reset ? 0 : Number(table.rotation ?? 0)
    }));

    const objectPatches = Array.isArray(body.objects)
      ? body.objects.map((item) => ({
          id: item.id,
          zone_id: item.zone_id ?? null,
          object_type: item.object_type,
          object_name: item.object_name?.trim() || null,
          color: item.color?.trim() || "#334155",
          position_x: body.reset ? 24 : Number(item.position_x ?? 24),
          position_y: body.reset ? 24 : Number(item.position_y ?? 24),
          width: body.reset ? 120 : Math.max(24, Number(item.width ?? 120)),
          height: body.reset ? 60 : Math.max(24, Number(item.height ?? 60)),
          rotation: body.reset ? 0 : Number(item.rotation ?? 0),
          z_index: Math.max(1, Math.trunc(Number(item.z_index ?? 1))),
          is_active: item.is_active ?? true,
          metadata: item.metadata ?? {}
        }))
      : [];

    const zoneIds = Array.from(
      new Set(
        [...patches.map((patch) => patch.zone_id), ...objectPatches.map((patch) => patch.zone_id)].filter(
          (value): value is string => Boolean(value)
        )
      )
    );
    if (zoneIds.length > 0) {
      const { data: zones, error: zoneError } = await supabase
        .from("table_zones")
        .select("id")
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", targetBranchId)
        .in("id", zoneIds);
      if (zoneError) {
        return fail("zone_lookup_failed", zoneError.message, 500);
      }
      const zoneSet = new Set((zones ?? []).map((zone) => zone.id as string));
      const invalidZoneId = zoneIds.find((zoneId) => !zoneSet.has(zoneId));
      if (invalidZoneId) {
        return fail("invalid_zone_id", `zone_id ${invalidZoneId} is not available in current branch.`, 422);
      }
    }

    const tableUpdates = await Promise.all(
      patches.map(async (patch) => {
        const { error } = await supabase
          .from("dining_tables")
          .update({
            zone_id: patch.zone_id,
            position_x: patch.position_x,
            position_y: patch.position_y,
            width: patch.width,
            height: patch.height,
            rotation: patch.rotation
          })
          .eq("tenant_id", auth.tenantId!)
          .eq("branch_id", targetBranchId)
          .eq("id", patch.id);

        return {
          id: patch.id,
          ok: !error,
          error: error?.message ?? null
        };
      })
    );

    const objectUpdates = await Promise.all(
      objectPatches.map(async (patch) => {
        const { error } = await supabase
          .from("table_layout_objects")
          .update({
            zone_id: patch.zone_id,
            object_type: patch.object_type,
            object_name: patch.object_name,
            color: patch.color,
            position_x: patch.position_x,
            position_y: patch.position_y,
            width: patch.width,
            height: patch.height,
            rotation: patch.rotation,
            z_index: patch.z_index,
            is_active: patch.is_active,
            metadata: patch.metadata
          })
          .eq("tenant_id", auth.tenantId!)
          .eq("branch_id", targetBranchId)
          .eq("id", patch.id);

        return {
          id: patch.id,
          ok: !error,
          error: error?.message ?? null
        };
      })
    );

    const failed = [...tableUpdates, ...objectUpdates].filter((update) => !update.ok);
    if (failed.length > 0) {
      return fail("floor_plan_save_failed", failed[0]?.error ?? "One or more floor plan updates failed.", 500);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "floor_plan_updated",
      targetTable: "dining_tables",
      metadata: {
        reset: body.reset ?? false,
        table_count: patches.length,
        object_count: objectPatches.length
      }
    });

    return ok({
      updated_tables: patches.length,
      updated_objects: objectPatches.length,
      reset: body.reset ?? false
    });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
