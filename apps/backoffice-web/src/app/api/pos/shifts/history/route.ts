import { PosGuardError, requirePermission, requirePosSession } from "@/lib/pos-session-guard";
import { fail, ok } from "@/lib/http";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type ShiftRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number | null;
  expected_cash: number | null;
  actual_cash: number | null;
  status: string;
};

type OrderRow = {
  id: string;
  shift_id: string | null;
  status: string;
  total_amount: number | null;
  grand_total: number | null;
  created_at: string;
};

type PaymentRow = {
  shift_id: string | null;
  order_id: string | null;
  method: string;
  amount: number | null;
  created_at: string | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return code === "42703" || message.includes(`column "${column}"`) || message.includes(`.${column}`) || message.includes("does not exist");
}

const BANGKOK_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function getBangkokDayEndUtc(dateLike: string) {
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.valueOf())) return null;
  const shifted = new Date(parsed.getTime() + BANGKOK_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - BANGKOK_UTC_OFFSET_MS);
}

function resolveShiftSummaryEndAt(shift: ShiftRow) {
  const bangkokDayEnd = getBangkokDayEndUtc(shift.opened_at);
  if (!bangkokDayEnd) return shift.closed_at ? new Date(shift.closed_at) : null;
  const closedAt = shift.closed_at ? new Date(shift.closed_at) : null;
  if (!closedAt || Number.isNaN(closedAt.valueOf())) return bangkokDayEnd;
  return closedAt.getTime() < bangkokDayEnd.getTime() ? closedAt : bangkokDayEnd;
}

function isWithinShiftSummaryWindow(params: {
  createdAt: string | null | undefined;
  shift: ShiftRow | undefined;
  shiftEndAt: Date | undefined;
}) {
  const { createdAt, shift, shiftEndAt } = params;
  if (!createdAt || !shift || !shiftEndAt) return true;
  const created = new Date(createdAt);
  const opened = new Date(shift.opened_at);
  if (Number.isNaN(created.valueOf()) || Number.isNaN(opened.valueOf())) return true;
  return created.getTime() >= opened.getTime() && created.getTime() <= shiftEndAt.getTime();
}

export async function GET(request: Request) {
  try {
    const scope = await requirePosSession();
    requirePermission(scope, "shift:join");
    await requireTenantFeature(scope.session.tenant_id, "attendance_tracking", scope.session.branch_id);
    const role = scope.session.role;
    const canViewBranchWide = role === "owner" || role === "manager";
    if (canViewBranchWide) {
      requirePermission(scope, "reports:view");
    }

    const { searchParams } = new URL(request.url);
    const daysRaw = Number(searchParams.get("days") ?? 30);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, Math.trunc(daysRaw))) : 30;
    const view = String(searchParams.get("view") ?? "auto").trim().toLowerCase();
    const selfOnly = canViewBranchWide ? view === "self" : true;
    const branchFilterRaw = String(searchParams.get("branch_id") ?? "all").trim();
    const branchFilter = canViewBranchWide ? branchFilterRaw : scope.session.branch_id;
    const useAllBranches = canViewBranchWide && (!branchFilter || branchFilter === "all");

    const startedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const supabase = getSupabaseServiceClient();

    const branchOptionsResult = canViewBranchWide
      ? await supabase
          .from("branches")
          .select("id,code,name,is_active")
          .eq("tenant_id", scope.session.tenant_id)
          .eq("is_active", true)
          .order("name", { ascending: true })
      : await supabase
          .from("branches")
          .select("id,code,name,is_active")
          .eq("tenant_id", scope.session.tenant_id)
          .eq("id", scope.session.branch_id)
          .eq("is_active", true)
          .limit(1);

    if (branchOptionsResult.error) {
      return fail("shift_branch_options_query_failed", branchOptionsResult.error.message, 500);
    }

    const branchOptions = ((branchOptionsResult.data ?? []) as Array<{ id: string; code: string | null; name: string | null; is_active: boolean }>)
      .filter((row) => row.is_active)
      .map((row) => ({ id: row.id, code: row.code, name: row.name }));
    const allowedBranchIds = new Set(branchOptions.map((branch) => branch.id));

    if (!useAllBranches && branchFilter && !allowedBranchIds.has(branchFilter)) {
      return fail("branch_filter_forbidden", "Selected branch is not accessible for this user.", 403);
    }

    let shiftsQuery = supabase
      .from("shifts")
      .select("id,tenant_id,branch_id,opened_by,closed_by,opened_at,closed_at,opening_cash,expected_cash,actual_cash,status")
      .eq("tenant_id", scope.session.tenant_id)
      .gte("opened_at", startedAfter)
      .order("opened_at", { ascending: false })
      .limit(300);

    if (!canViewBranchWide || !useAllBranches) {
      const targetBranchId = canViewBranchWide ? branchFilter : scope.session.branch_id;
      if (targetBranchId) {
        shiftsQuery = shiftsQuery.eq("branch_id", targetBranchId);
      }
    }
    if (selfOnly) {
      shiftsQuery = shiftsQuery.eq("opened_by", scope.session.user_id);
    }

    const { data: shiftRows, error: shiftError } = await shiftsQuery;
    if (shiftError) {
      return fail("shift_history_query_failed", shiftError.message, 500);
    }

    const shifts = ((shiftRows ?? []) as ShiftRow[]).map((row) => ({
      ...row,
      opening_cash: toNumber(row.opening_cash),
      expected_cash: row.expected_cash === null ? null : toNumber(row.expected_cash),
      actual_cash: row.actual_cash === null ? null : toNumber(row.actual_cash)
    }));

    if (shifts.length === 0) {
      return ok({
        filters: {
          days,
          self_only: selfOnly,
          can_view_branch_wide: canViewBranchWide,
          selected_branch_id: useAllBranches ? "all" : branchFilter,
          branch_options: branchOptions
        },
        summary: {
          shift_count: 0,
          order_count: 0,
          cancelled_order_count: 0,
          sales_total: 0,
          cash_total: 0,
          transfer_total: 0
        },
        shifts: []
      });
    }

    const shiftIds = shifts.map((shift) => shift.id);
    const shiftMap = new Map<string, ShiftRow>(shifts.map((shift) => [shift.id, shift]));
    const shiftEndAtMap = new Map<string, Date | undefined>(
      shifts.map((shift) => [shift.id, resolveShiftSummaryEndAt(shift) ?? undefined])
    );
    const branchIds = Array.from(new Set(shifts.map((shift) => shift.branch_id).filter((id) => Boolean(id))));

    const branchResult = branchIds.length
      ? await supabase
          .from("branches")
          .select("id,code,name")
          .in("id", branchIds)
      : { data: [], error: null };

    if (branchResult.error) {
      return fail("shift_branches_query_failed", branchResult.error.message, 500);
    }

    const branchMap = new Map(
      ((branchResult.data ?? []) as Array<{ id: string; code: string | null; name: string | null }>).map((row) => [
        row.id,
        { code: row.code, name: row.name }
      ])
    );

    const ordersQuery = await supabase
      .from("orders")
      .select("id,shift_id,status,total_amount,grand_total,created_at")
      .eq("tenant_id", scope.session.tenant_id)
      .in("shift_id", shiftIds);

    if (ordersQuery.error) {
      return fail("shift_orders_query_failed", ordersQuery.error.message, 500);
    }

    const orders = (ordersQuery.data ?? []) as OrderRow[];

    let paymentRows: PaymentRow[] = [];
    const paymentByShift = await supabase
      .from("payments")
      .select("shift_id,order_id,method,amount,created_at")
      .eq("tenant_id", scope.session.tenant_id)
      .in("shift_id", shiftIds);

    if (paymentByShift.error && isMissingColumnError(paymentByShift.error, "shift_id")) {
      const orderIdToShift = new Map<string, string>();
      for (const order of orders) {
        if (order.shift_id) orderIdToShift.set(order.id, order.shift_id);
      }
      const fallbackPayments = await supabase
        .from("payments")
        .select("order_id,method,amount,created_at")
        .eq("tenant_id", scope.session.tenant_id)
        .in("order_id", Array.from(orderIdToShift.keys()));
      if (fallbackPayments.error) {
        return fail("shift_payments_query_failed", fallbackPayments.error.message, 500);
      }
      paymentRows = ((fallbackPayments.data ?? []) as Array<{ order_id: string | null; method: string; amount: number | null; created_at: string | null }>).map((row) => ({
        shift_id: row.order_id ? orderIdToShift.get(row.order_id) ?? null : null,
        order_id: row.order_id,
        method: row.method,
        amount: row.amount,
        created_at: row.created_at
      }));
    } else if (paymentByShift.error) {
      return fail("shift_payments_query_failed", paymentByShift.error.message, 500);
    } else {
      paymentRows = (paymentByShift.data ?? []) as PaymentRow[];
    }

    const totalsByShift = new Map<
      string,
      {
        order_count: number;
        cancelled_order_count: number;
        sales_total: number;
        cash_total: number;
        transfer_total: number;
      }
    >();

    for (const shift of shifts) {
      totalsByShift.set(shift.id, {
        order_count: 0,
        cancelled_order_count: 0,
        sales_total: 0,
        cash_total: 0,
        transfer_total: 0
      });
    }

    const includedOrderIds = new Set<string>();
    for (const order of orders) {
      if (!order.shift_id) continue;
      const bucket = totalsByShift.get(order.shift_id);
      if (!bucket) continue;
      const shiftRow = shiftMap.get(order.shift_id);
      const shiftEndAt = shiftEndAtMap.get(order.shift_id);
      if (!isWithinShiftSummaryWindow({ createdAt: order.created_at, shift: shiftRow, shiftEndAt })) {
        continue;
      }
      includedOrderIds.add(order.id);
      bucket.order_count += 1;
      if (order.status === "cancelled") {
        bucket.cancelled_order_count += 1;
      } else {
        bucket.sales_total += toNumber(order.grand_total ?? order.total_amount);
      }
    }

    for (const payment of paymentRows) {
      if (!payment.shift_id) continue;
      const bucket = totalsByShift.get(payment.shift_id);
      if (!bucket) continue;
      if (payment.order_id && !includedOrderIds.has(payment.order_id)) continue;
      const shiftRow = shiftMap.get(payment.shift_id);
      const shiftEndAt = shiftEndAtMap.get(payment.shift_id);
      if (!isWithinShiftSummaryWindow({ createdAt: payment.created_at, shift: shiftRow, shiftEndAt })) {
        continue;
      }
      if (payment.method === "cash") {
        bucket.cash_total += toNumber(payment.amount);
      } else if (payment.method === "bank_transfer") {
        bucket.transfer_total += toNumber(payment.amount);
      }
    }

    const payloadShifts = shifts.map((shift) => {
      const totals = totalsByShift.get(shift.id) ?? {
        order_count: 0,
        cancelled_order_count: 0,
        sales_total: 0,
        cash_total: 0,
        transfer_total: 0
      };
      return {
        ...shift,
        branch_code: branchMap.get(shift.branch_id)?.code ?? null,
        branch_name: branchMap.get(shift.branch_id)?.name ?? null,
        summary_cutoff_at: (shiftEndAtMap.get(shift.id) ?? null)?.toISOString() ?? null,
        metrics: totals
      };
    });

    const summary = payloadShifts.reduce(
      (acc, shift) => {
        acc.shift_count += 1;
        acc.order_count += shift.metrics.order_count;
        acc.cancelled_order_count += shift.metrics.cancelled_order_count;
        acc.sales_total += shift.metrics.sales_total;
        acc.cash_total += shift.metrics.cash_total;
        acc.transfer_total += shift.metrics.transfer_total;
        return acc;
      },
      {
        shift_count: 0,
        order_count: 0,
        cancelled_order_count: 0,
        sales_total: 0,
        cash_total: 0,
        transfer_total: 0
      }
    );

    return ok({
      filters: {
        days,
        self_only: selfOnly,
        can_view_branch_wide: canViewBranchWide,
        selected_branch_id: useAllBranches ? "all" : branchFilter,
        branch_options: branchOptions
      },
      summary,
      shifts: payloadShifts
    });
  } catch (error) {
    if (error instanceof FeatureGateError) {
      return fail(error.code, error.message, error.status);
    }
    if (error instanceof PosGuardError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("shift_history_failed", error instanceof Error ? error.message : "Unknown error.", 500);
  }
}
