import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { canManageTables, tableShapes, tableStatuses } from "@/lib/table-management";
import { resolveTableBranchScope } from "@/lib/table-branch-scope";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type TablePayload = {
  branch_id?: string;
  zone_id?: string | null;
  table_code?: string;
  table_name?: string | null;
  capacity?: number;
  status?: string;
  shape?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

async function getNextNumericTableCode(args: {
  supabase: ReturnType<typeof getSupabaseServiceClient>;
  tenantId: string;
  branchId: string;
}) {
  const { supabase, tenantId, branchId } = args;
  const rpcResult = await supabase.rpc("next_dining_table_code", {
    p_tenant_id: tenantId,
    p_branch_id: branchId
  });

  if (!rpcResult.error && typeof rpcResult.data === "string" && rpcResult.data.trim().length > 0) {
    return { code: rpcResult.data.trim(), error: null };
  }

  // Fallback path for environments where migration/function is not yet applied.
  const { data, error } = await supabase.from("dining_tables").select("table_code").eq("tenant_id", tenantId).eq("branch_id", branchId);

  if (error) {
    const rpcMessage = rpcResult.error?.message ? ` (rpc: ${rpcResult.error.message})` : "";
    return { code: null, error: `${error.message}${rpcMessage}` };
  }

  let maxCode = 0;
  for (const row of data ?? []) {
    const raw = String(row.table_code ?? "").trim();
    const groups = raw.match(/\d+/g);
    const lastGroup = groups?.[groups.length - 1];
    if (!lastGroup) continue;
    const numeric = Number(lastGroup);
    if (Number.isFinite(numeric) && numeric > maxCode) {
      maxCode = numeric;
    }
  }

  return { code: String(maxCode + 1), error: null };
}

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
      .from("dining_tables")
      .select(
        "id,tenant_id,branch_id,zone_id,table_code,table_name,capacity,status,shape,position_x,position_y,width,height,rotation,is_active,metadata,created_at,updated_at"
      )
      .eq("tenant_id", auth.tenantId!)
      .order("table_code", { ascending: true });
    query = branchScope.branchIds.length === 1 ? query.eq("branch_id", branchScope.branchIds[0]) : query.in("branch_id", branchScope.branchIds);
    const { data, error } = await query;

    if (error) {
      return fail("table_query_failed", error.message, 500);
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
    if (!canManageTables(auth.branchRole)) {
      return fail("forbidden_role", "Only manager or owner can manage tables.", 403);
    }
    const body = (await req.json()) as TablePayload;
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
    const manualTableCode = body.table_code?.trim() ?? "";

    const status = body.status && tableStatuses.includes(body.status as (typeof tableStatuses)[number]) ? body.status : "available";
    const shape = body.shape && tableShapes.includes(body.shape as (typeof tableShapes)[number]) ? body.shape : "rectangle";
    const capacity = Math.max(1, Number(body.capacity ?? 4));

    if (body.zone_id) {
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

    let data: {
      id: string;
      table_code: string;
      zone_id: string | null;
    } | null = null;

    let lastErrorMessage: string | null = null;
    let autoCode = manualTableCode.length === 0;
    let generatedCode = "";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (autoCode) {
        const generated = await getNextNumericTableCode({
          supabase,
          tenantId: auth.tenantId!,
          branchId: targetBranchId
        });
        if (generated.error || !generated.code) {
          return fail("table_code_generate_failed", generated.error ?? "Failed to generate next table code.", 500);
        }
        generatedCode = generated.code;
      }

      const candidateCode = autoCode ? generatedCode : manualTableCode;
      const insertResult = await supabase
        .from("dining_tables")
        .insert({
          tenant_id: auth.tenantId,
          branch_id: targetBranchId,
          zone_id: body.zone_id ?? null,
          table_code: candidateCode,
          table_name: body.table_name?.trim() || null,
          capacity,
          status,
          shape,
          position_x: Number(body.position_x ?? 0),
          position_y: Number(body.position_y ?? 0),
          width: Math.max(40, Number(body.width ?? 96)),
          height: Math.max(40, Number(body.height ?? 72)),
          rotation: Number(body.rotation ?? 0),
          is_active: body.is_active ?? true,
          metadata: body.metadata ?? {}
        })
        .select(
          "id,tenant_id,branch_id,zone_id,table_code,table_name,capacity,status,shape,position_x,position_y,width,height,rotation,is_active,metadata,created_at,updated_at"
        )
        .single();

      if (!insertResult.error && insertResult.data) {
        data = insertResult.data;
        break;
      }

      lastErrorMessage = insertResult.error?.message ?? "Failed to create table.";
      const isUniqueViolation = insertResult.error?.code === "23505";
      if (!(autoCode && isUniqueViolation)) {
        return fail("table_create_failed", lastErrorMessage, 500);
      }
    }

    if (!data) {
      return fail("table_create_failed", lastErrorMessage ?? "Failed to create table.", 500);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: targetBranchId,
      actorUserId: auth.userId,
      actorRole: auth.branchRole!,
      action: "table_created",
      targetTable: "dining_tables",
      targetId: data.id,
      metadata: {
        table_code: data.table_code,
        branch_id: targetBranchId,
        zone_id: data.zone_id
      }
    });

    return ok(data, 201);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
