import { NextResponse } from "next/server";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { PosGuardError, requireActiveShift, requirePermission, withPosSessionCookie } from "@/lib/pos-session-guard";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_total: number | null;
  grand_total: number | null;
  paid_total: number | null;
  created_at: string;
  cashier_user_id: string | null;
  pos_session_id: string | null;
  device_code: string | null;
};

export async function GET() {
  try {
    const { scope, shift } = await requireActiveShift();
    requirePermission(scope, "sales:list:view");
    await requireTenantFeature(scope.session.tenant_id, "core_pos_sales", scope.session.branch_id);
    const supabase = getSupabaseServiceClient();
    const { data: orderRows, error } = await supabase
      .from("orders")
      .select("id,order_no,status,subtotal,discount_amount,tax_total,grand_total,paid_total,created_at,cashier_user_id,pos_session_id,device_code")
      .eq("tenant_id", scope.session.tenant_id)
      .eq("branch_id", scope.session.branch_id)
      .eq("shift_id", shift.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ data: null, error: { code: "orders_shift_query_failed", message: error.message } }, { status: 500 });
    }

    const orders = (orderRows ?? []) as OrderRow[];
    const orderIds = orders.map((row) => row.id);

    let paymentMap = new Map<string, Array<{ method: string; amount: number; status: string; created_at: string }>>();
    if (orderIds.length > 0) {
      const { data: paymentRows } = await supabase
        .from("payments")
        .select("order_id,method,amount,status,created_at")
        .eq("tenant_id", scope.session.tenant_id)
        .eq("branch_id", scope.session.branch_id)
        .in("order_id", orderIds)
        .order("created_at", { ascending: true });

      paymentMap = new Map<string, Array<{ method: string; amount: number; status: string; created_at: string }>>();
      for (const row of paymentRows ?? []) {
        const key = String(row.order_id ?? "");
        if (!key) continue;
        const list = paymentMap.get(key) ?? [];
        list.push({
          method: String(row.method ?? ""),
          amount: Number(row.amount ?? 0),
          status: String(row.status ?? "paid"),
          created_at: String(row.created_at ?? "")
        });
        paymentMap.set(key, list);
      }
    }

    const response = NextResponse.json({
      data: {
        shift: {
          id: shift.id,
          status: shift.status,
          opened_at: shift.opened_at
        },
        orders: orders.map((row) => ({
          ...row,
          subtotal: Number(row.subtotal ?? 0),
          discount_amount: Number(row.discount_amount ?? 0),
          tax_total: Number(row.tax_total ?? 0),
          grand_total: Number(row.grand_total ?? 0),
          paid_total: Number(row.paid_total ?? 0),
          payments: paymentMap.get(row.id) ?? []
        }))
      },
      error: null
    });

    return withPosSessionCookie(response, scope.session.id);
  } catch (error) {
    if (error instanceof FeatureGateError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof PosGuardError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { data: null, error: { code: "orders_current_shift_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
