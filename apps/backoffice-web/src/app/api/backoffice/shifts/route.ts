import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/http";
import { buildPaginationMeta, parsePagination } from "@/lib/query-params";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams, 10);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const status = searchParams.get("status")?.trim();
    const branchId = searchParams.get("branch_id")?.trim();

    if (branchId && branchId !== auth.branchId) {
      return fail("forbidden_branch_scope", "Cross-branch access is not allowed.", 403);
    }

    let query = supabase
      .from("shifts")
      .select(
        "id,tenant_id,branch_id,opened_by,closed_by,opened_at,closed_at,opening_cash,expected_cash,actual_cash,status,created_at",
        { count: "exact" }
      )
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .order("opened_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) {
      return fail("shifts_query_failed", error.message, 500);
    }

    return ok({
      items: data ?? [],
      pagination: buildPaginationMeta(page, pageSize, count)
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const body = (await req.json()) as { opening_cash: number };
    const openingCash = Number(body.opening_cash ?? 0);

    if (Number.isNaN(openingCash) || openingCash < 0) {
      return fail("invalid_opening_cash", "Opening cash must be zero or positive.", 422);
    }

    const { data: existingOpenShift, error: openShiftError } = await supabase
      .from("shifts")
      .select("id")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openShiftError) {
      return fail("shift_open_check_failed", openShiftError.message, 500);
    }

    if (existingOpenShift) {
      return fail("shift_already_open", "There is already an open shift for this branch.", 409);
    }

    const { data, error } = await supabase
      .from("shifts")
      .insert({
        tenant_id: auth.tenantId,
        branch_id: auth.branchId,
        opened_by: auth.userId,
        opening_cash: openingCash,
        status: "open"
      })
      .select("id,tenant_id,branch_id,opened_by,opened_at,opening_cash,status")
      .single();

    if (error) {
      return fail("shift_open_failed", error.message, 500);
    }

    await appendAuditLog({
      tenantId: auth.tenantId!,
      branchId: auth.branchId!,
      actorUserId: auth.userId,
      actorRole: auth.branchRole!,
      action: "shift_opened",
      targetTable: "shifts",
      targetId: data.id,
      metadata: {
        opening_cash: openingCash
      }
    });

    return ok(data, 201);
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
