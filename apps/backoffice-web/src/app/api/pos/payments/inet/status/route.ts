import { fail, ok } from "@/lib/http";
import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type PaymentIntentStatusRow = {
  id: string;
  order_id: string;
  provider_order_id: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  paid_at: string | null;
};

export async function GET(request: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "receipts:view" });
    const paymentIntentId = new URL(request.url).searchParams.get("payment_intent_id")?.trim();
    if (!paymentIntentId) {
      return fail("missing_payment_intent_id", "payment_intent_id is required.", 422);
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("pos_payment_intents")
      .select("id,order_id,provider_order_id,amount,status,paid_at")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .eq("id", paymentIntentId)
      .eq("provider", "inet_nops")
      .maybeSingle<PaymentIntentStatusRow>();
    if (error) {
      return fail("payment_intent_query_failed", error.message, 500);
    }
    if (!data) {
      return fail("payment_intent_not_found", "Payment intent was not found in current branch.", 404);
    }

    return ok({
      status: data.status,
      order_id: data.order_id,
      amount: Number(data.amount),
      paid_at: data.paid_at,
      provider_order_id: data.provider_order_id
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
