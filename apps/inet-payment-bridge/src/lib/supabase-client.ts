type MarkPaidInput = {
  paymentRef: string;
  orderId: string;
  amount: number;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export async function markPosPaymentPaid(input: MarkPaidInput) {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const table = env("SUPABASE_PAYMENT_TABLE") || "pos_payment_intents";
  const refColumn = env("SUPABASE_PAYMENT_REF_COLUMN") || "provider_order_id";

  if (!supabaseUrl || !serviceRoleKey) {
    return { skipped: true, reason: "supabase_not_configured" };
  }

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set(refColumn, `eq.${input.paymentRef}`);
  url.searchParams.set("status", "eq.pending");

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`supabase_update_failed:${response.status}`);
  }

  const rows = (await response.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { skipped: true, reason: "already_settled_or_missing_payment" };
  }

  return { skipped: false, rows: rows.length };
}
