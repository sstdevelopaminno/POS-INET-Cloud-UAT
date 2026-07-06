import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { buildPaginationMeta, parseBool, parsePagination, sanitizeSearchTerm } from "@/lib/query-params";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

function guardStaffManagementRole(role: string | null) {
  return role === "manager" || role === "owner";
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    if (!guardStaffManagementRole(auth.branchRole)) {
      return fail("forbidden_role", "Only manager or owner can access staff management.", 403);
    }

    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams, 10);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const roleFilter = searchParams.get("role")?.trim();
    const isActiveFilter = parseBool(searchParams.get("is_active"));
    const search = sanitizeSearchTerm(searchParams.get("search"));
    const branchId = searchParams.get("branch_id")?.trim();

    if (branchId && branchId !== auth.branchId) {
      return fail("forbidden_branch_scope", "Cross-branch access is not allowed.", 403);
    }

    let query = supabase
      .from("user_branch_roles")
      .select(
        "id,user_id,tenant_id,branch_id,role,is_default,created_at,users_profiles!inner(id,email,full_name,is_active,platform_role)",
        { count: "exact" }
      )
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (roleFilter) {
      query = query.eq("role", roleFilter);
    }

    if (isActiveFilter !== null) {
      query = query.eq("users_profiles.is_active", isActiveFilter);
    }

    if (search) {
      query = query.or(`users_profiles.full_name.ilike.%${search}%,users_profiles.email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return fail("staff_query_failed", error.message, 500);
    }

    return ok({
      items: data ?? [],
      pagination: buildPaginationMeta(page, pageSize, count)
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    if (!guardStaffManagementRole(auth.branchRole)) {
      return fail("forbidden_role", "Only manager or owner can modify staff.", 403);
    }

    const supabase = getSupabaseServiceClient();
    const body = (await req.json()) as {
      user_id: string;
      role?: "owner" | "manager" | "staff";
      is_active?: boolean;
    };

    if (!body.user_id) {
      return fail("invalid_payload", "user_id is required.", 422);
    }

    if (!body.role && typeof body.is_active !== "boolean") {
      return fail("invalid_payload", "role or is_active must be provided.", 422);
    }

    if (body.role) {
      const { error: roleError } = await supabase
        .from("user_branch_roles")
        .update({ role: body.role })
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .eq("user_id", body.user_id);

      if (roleError) {
        return fail("staff_role_update_failed", roleError.message, 500);
      }
    }

    if (typeof body.is_active === "boolean") {
      const { error: profileError } = await supabase
        .from("users_profiles")
        .update({ is_active: body.is_active })
        .eq("id", body.user_id);

      if (profileError) {
        return fail("staff_status_update_failed", profileError.message, 500);
      }
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: auth.branchId!,
      actorUserId: auth.userId,
      actorRole: auth.branchRole!,
      action: "staff_updated",
      targetTable: "users_profiles",
      targetId: body.user_id,
      metadata: {
        role: body.role ?? null,
        is_active: typeof body.is_active === "boolean" ? body.is_active : null
      }
    });

    return ok({
      user_id: body.user_id,
      role: body.role ?? null,
      is_active: typeof body.is_active === "boolean" ? body.is_active : null
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
