import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { resolveTableBranchScope } from "@/lib/table-branch-scope";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type ZonePayload = {
  branch_id?: string;
  zone_name: string;
  color?: string;
  display_order?: number;
  is_active?: boolean;
};

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const supabase = getSupabaseServiceClient();
    const branchScope = await resolveTableBranchScope({
      auth,
      requestedBranchId: new URL(req.url).searchParams.get("branch_id"),
      allowAll: true,
      supabaseClient: supabase
    });
    if (!branchScope.ok) {
      return fail(branchScope.code, branchScope.message, branchScope.status);
    }
    let query = supabase
      .from("table_zones")
      .select("id,tenant_id,branch_id,zone_name,color,display_order,is_active,metadata,created_at,updated_at")
      .eq("tenant_id", auth.tenantId!)
      .order("display_order", { ascending: true })
      .order("zone_name", { ascending: true });
    query = branchScope.branchIds.length === 1 ? query.eq("branch_id", branchScope.branchIds[0]) : query.in("branch_id", branchScope.branchIds);
    const { data, error } = await query;

    if (error) {
      return fail("zone_query_failed", error.message, 500);
    }

    return ok({ items: data ?? [], branches: branchScope.branches, branch_id: branchScope.targetBranchId });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "table_management");
    const body = (await req.json()) as ZonePayload;
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
    const zoneName = body.zone_name?.trim();
    if (!zoneName) {
      return fail("invalid_zone_name", "zone_name is required.", 422);
    }

    const { data, error } = await supabase
      .from("table_zones")
      .insert({
        tenant_id: auth.tenantId,
        branch_id: targetBranchId,
        zone_name: zoneName,
        color: body.color?.trim() || "#0ea5e9",
        display_order: Number(body.display_order ?? 0),
        is_active: body.is_active ?? true
      })
      .select("id,tenant_id,branch_id,zone_name,color,display_order,is_active,metadata,created_at,updated_at")
      .single();

    if (error) {
      return fail("zone_create_failed", error.message, 500);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: targetRole!,
      action: "table_zone_created",
      targetTable: "table_zones",
      targetId: data.id,
      metadata: {
        zone_name: data.zone_name,
        color: data.color
      }
    });

    return ok(data, 201);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
