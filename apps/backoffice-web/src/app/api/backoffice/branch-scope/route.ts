import { NextResponse } from "next/server";
import { getAuthContext, POS_ACTIVE_BRANCH_COOKIE } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type BranchScopeItem = {
  id: string;
  code: string;
  name: string;
  role: "owner" | "manager" | "staff";
  isDefault: boolean;
};

export async function GET() {
  try {
    const auth = await getAuthContext({ requireBranchScope: false });
    if (!auth.tenantId) {
      return fail("tenant_scope_required", "Tenant scope is required.", 401);
    }

    const supabase = getSupabaseServiceClient();
    const { data: roleRows, error: roleError } = await supabase
      .from("user_branch_roles")
      .select("branch_id,role,is_default")
      .eq("tenant_id", auth.tenantId)
      .eq("user_id", auth.userId);

    if (roleError) {
      return fail("branch_scope_fetch_failed", roleError.message, 500);
    }

    const normalizedRoles = (roleRows ?? [])
      .map((row) => {
        const branchId = String((row as { branch_id?: string | null }).branch_id ?? "").trim();
        const role = String((row as { role?: string | null }).role ?? "").trim();
        if (!branchId || (role !== "owner" && role !== "manager" && role !== "staff")) return null;
        return {
          branchId,
          role: role as "owner" | "manager" | "staff",
          isDefault: Boolean((row as { is_default?: boolean | null }).is_default)
        };
      })
      .filter((row): row is { branchId: string; role: "owner" | "manager" | "staff"; isDefault: boolean } => Boolean(row));

    if (normalizedRoles.length === 0) {
      return ok({
        currentBranchId: null,
        items: [] as BranchScopeItem[]
      });
    }

    const { data: branchRows, error: branchError } = await supabase
      .from("branches")
      .select("id,code,name,is_active")
      .eq("tenant_id", auth.tenantId)
      .in("id", normalizedRoles.map((row) => row.branchId))
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (branchError) {
      return fail("branch_scope_fetch_failed", branchError.message, 500);
    }

    const roleMap = new Map(normalizedRoles.map((row) => [row.branchId, row]));
    const items: BranchScopeItem[] = (branchRows ?? [])
      .map((row) => {
        const branchId = String((row as { id?: string | null }).id ?? "").trim();
        const roleInfo = roleMap.get(branchId);
        if (!branchId || !roleInfo) return null;
        return {
          id: branchId,
          code: String((row as { code?: string | null }).code ?? branchId),
          name: String((row as { name?: string | null }).name ?? branchId),
          role: roleInfo.role,
          isDefault: roleInfo.isDefault
        };
      })
      .filter((row): row is BranchScopeItem => Boolean(row));

    const currentBranchId = items.some((item) => item.id === auth.branchId)
      ? auth.branchId
      : items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? null;

    return ok({
      currentBranchId,
      items
    });
  } catch (error) {
    return fail("branch_scope_fetch_failed", error instanceof Error ? error.message : "Failed to load branch scope.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: false });
    if (!auth.tenantId) {
      return fail("tenant_scope_required", "Tenant scope is required.", 401);
    }

    const body = (await request.json().catch(() => null)) as { branch_id?: string } | null;
    const branchId = String(body?.branch_id ?? "").trim();
    if (!branchId) {
      return fail("branch_id_required", "branch_id is required.", 400);
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("user_branch_roles")
      .select("branch_id")
      .eq("tenant_id", auth.tenantId)
      .eq("user_id", auth.userId)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (error) {
      return fail("branch_scope_update_failed", error.message, 500);
    }
    if (!data) {
      return fail("forbidden_branch", "You do not have permission for this branch.", 403);
    }

    const response = NextResponse.json({ data: { branch_id: branchId }, error: null });
    response.cookies.set({
      name: POS_ACTIVE_BRANCH_COOKIE,
      value: branchId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch (error) {
    return fail("branch_scope_update_failed", error instanceof Error ? error.message : "Failed to update branch scope.", 500);
  }
}
