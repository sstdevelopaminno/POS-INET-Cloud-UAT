import type { BranchRole, PlatformRole } from "@pos/shared-types";
import type { AuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { ok } from "@/lib/http";
import { allowsInetNopsUatWithoutMerchantId } from "@/lib/payments/inet-nops-client";
import { finalizePosPayment } from "@/lib/payments/pos-payment-finalize";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type CallbackDetail = {
  order_id?: unknown;
  receive_amount?: unknown;
  response_code?: unknown;
  response_message?: unknown;
  merchant_id?: unknown;
  payment_reference_id?: unknown;
  payment_type?: unknown;
  payment_acquirer_bank?: unknown;
  transaction_date?: unknown;
  transaction_time?: unknown;
  order_description?: unknown;
};

type CallbackBody = {
  event?: unknown;
  merchant_id?: unknown;
  timestamp?: unknown;
  retry_flag?: unknown;
  detail?: CallbackDetail;
};

type PaymentIntentRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_id: string;
  provider_order_id: string;
  merchant_id: string | null;
  amount: number;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  request_group_id: string | null;
  created_by: string | null;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function isSameAmount(left: number, right: number): boolean {
  return Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
}

function buildSafeCallbackPayload(args: {
  event: string | null;
  merchantId: string | null;
  timestamp: string | null;
  retryFlag: string | null;
  responseCode: number | null;
  responseMessage: string | null;
  detailMerchantId: string | null;
  providerOrderId: string | null;
  paymentReferenceId: string | null;
  receiveAmount: number | null;
  paymentType: string | null;
  paymentAcquirerBank: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  orderDescription: string | null;
}) {
  return {
    event: args.event,
    merchant_id: args.merchantId,
    timestamp: args.timestamp,
    retry_flag: args.retryFlag,
    detail: {
      response_code: args.responseCode,
      response_message: args.responseMessage,
      merchant_id: args.detailMerchantId,
      order_id: args.providerOrderId,
      payment_reference_id: args.paymentReferenceId,
      receive_amount: args.receiveAmount,
      payment_type: args.paymentType,
      payment_acquirer_bank: args.paymentAcquirerBank,
      transaction_date: args.transactionDate,
      transaction_time: args.transactionTime,
      order_description: args.orderDescription
    }
  };
}

async function insertCallbackLog(args: {
  event: string | null;
  providerTimestamp: string | null;
  retryFlag: string | null;
  providerOrderId: string | null;
  paymentReferenceId: string | null;
  responseCode: number | null;
  responseMessage: string | null;
  receiveAmount: number | null;
  paymentType: string | null;
  paymentAcquirerBank: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  orderDescription: string | null;
  rawPayload: unknown;
  intent?: PaymentIntentRow | null;
  processingStatus: "received" | "processed" | "duplicate" | "validation_failed" | "error";
  errorMessage?: string | null;
}) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("pos_payment_callback_logs")
    .insert({
      provider: "inet_nops",
      tenant_id: args.intent?.tenant_id ?? null,
      branch_id: args.intent?.branch_id ?? null,
      payment_intent_id: args.intent?.id ?? null,
      event: args.event,
      provider_timestamp: args.providerTimestamp,
      retry_flag: args.retryFlag,
      provider_order_id: args.providerOrderId,
      payment_reference_id: args.paymentReferenceId,
      response_code: args.responseCode,
      response_message: args.responseMessage,
      receive_amount: args.receiveAmount,
      payment_type: args.paymentType,
      payment_acquirer_bank: args.paymentAcquirerBank,
      transaction_date: args.transactionDate,
      transaction_time: args.transactionTime,
      order_description: args.orderDescription,
      raw_payload: args.rawPayload,
      processing_status: args.processingStatus,
      error_message: args.errorMessage ?? null
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

async function updateCallbackLog(logId: string, status: "processed" | "duplicate" | "validation_failed" | "error", errorMessage?: string | null) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("pos_payment_callback_logs")
    .update({
      processing_status: status,
      error_message: errorMessage ?? null
    })
    .eq("id", logId);
  if (error) throw new Error(error.message);
}

function buildCallbackAuth(intent: PaymentIntentRow): AuthContext | null {
  if (!intent.created_by) return null;
  return {
    userId: intent.created_by,
    tenantId: intent.tenant_id,
    branchId: intent.branch_id,
    branchRole: "staff" as BranchRole,
    platformRole: "tenant_user" as PlatformRole
  };
}

type ClaimedPaymentIntent = {
  intent: PaymentIntentRow;
  claimId: string;
};

function buildCallbackClaimId(): string {
  return `inet_callback_processing:${crypto.randomUUID()}`;
}

async function claimPendingPaymentIntent(intent: PaymentIntentRow): Promise<ClaimedPaymentIntent | null> {
  const supabase = getSupabaseServiceClient();
  const claimId = buildCallbackClaimId();
  const { data, error } = await supabase
    .from("pos_payment_intents")
    .update({ failed_reason: claimId })
    .eq("id", intent.id)
    .eq("status", "pending")
    .is("failed_reason", null)
    .select("id,tenant_id,branch_id,order_id,provider_order_id,merchant_id,amount,status,request_group_id,created_by")
    .maybeSingle<PaymentIntentRow>();
  if (error) throw new Error(error.message);
  return data ? { intent: data, claimId } : null;
}

async function releasePaymentIntentClaim(intent: PaymentIntentRow, claimId: string) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("pos_payment_intents")
    .update({ failed_reason: null })
    .eq("id", intent.id)
    .eq("status", "pending")
    .eq("failed_reason", claimId);
  if (error) throw new Error(error.message);
}

async function markPaymentIntentPaid(intent: PaymentIntentRow, claimId: string, paymentReferenceId: string | null) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("pos_payment_intents")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      inet_payment_reference_id: paymentReferenceId,
      failed_reason: null
    })
    .eq("id", intent.id)
    .eq("status", "pending")
    .eq("failed_reason", claimId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function POST(request: Request) {
  let rawPayload: unknown = null;
  try {
    rawPayload = await request.json();
  } catch {
    rawPayload = {};
  }

  const body = (rawPayload && typeof rawPayload === "object" ? rawPayload : {}) as CallbackBody;
  const detail = body.detail ?? {};
  const event = readString(body.event) || null;
  const providerTimestamp = readString(body.timestamp) || null;
  const retryFlag = readString(body.retry_flag) || null;
  const providerOrderId = readString(detail.order_id) || null;
  const receiveAmount = readNumber(detail.receive_amount);
  const responseCode = readNumber(detail.response_code);
  const responseMessage = readString(detail.response_message) || null;
  const rootMerchantId = readString(body.merchant_id) || null;
  const detailMerchantId = readString(detail.merchant_id) || null;
  const callbackMerchantIds = [...new Set([detailMerchantId, rootMerchantId].filter((value): value is string => Boolean(value)))];
  const paymentReferenceId = readString(detail.payment_reference_id) || null;
  const paymentType = readString(detail.payment_type) || null;
  const paymentAcquirerBank = readString(detail.payment_acquirer_bank) || null;
  const transactionDate = readString(detail.transaction_date) || null;
  const transactionTime = readString(detail.transaction_time) || null;
  const orderDescription = readString(detail.order_description) || null;
  const callbackLogPayload = buildSafeCallbackPayload({
    event,
    merchantId: rootMerchantId,
    timestamp: providerTimestamp,
    retryFlag,
    responseCode,
    responseMessage,
    detailMerchantId,
    providerOrderId,
    paymentReferenceId,
    receiveAmount,
    paymentType,
    paymentAcquirerBank,
    transactionDate,
    transactionTime,
    orderDescription
  });

  const supabase = getSupabaseServiceClient();
  let intent: PaymentIntentRow | null = null;

  try {
    if (providerOrderId) {
      const { data, error } = await supabase
        .from("pos_payment_intents")
        .select("id,tenant_id,branch_id,order_id,provider_order_id,merchant_id,amount,status,request_group_id,created_by")
        .eq("provider", "inet_nops")
        .eq("provider_order_id", providerOrderId)
        .maybeSingle<PaymentIntentRow>();
      if (error) throw new Error(error.message);
      intent = data ?? null;
    }

    const logId = await insertCallbackLog({
      event,
      providerTimestamp,
      retryFlag,
      providerOrderId,
      paymentReferenceId,
      responseCode,
      responseMessage,
      receiveAmount,
      paymentType,
      paymentAcquirerBank,
      transactionDate,
      transactionTime,
      orderDescription,
      rawPayload: callbackLogPayload,
      intent,
      processingStatus: "received"
    });

    if (event !== "payment_status_change" || !providerOrderId || receiveAmount === null || responseCode === null) {
      await updateCallbackLog(logId, "validation_failed", "Invalid INET callback payload shape.");
      return ok({ status: "validation_failed" });
    }
    if (!intent) {
      await updateCallbackLog(logId, "validation_failed", "Payment intent was not found.");
      return ok({ status: "validation_failed" });
    }
    const allowsUatMerchantIdFallback = allowsInetNopsUatWithoutMerchantId("uat");
    const merchantMatches = intent.merchant_id
      ? callbackMerchantIds.includes(intent.merchant_id)
      : allowsUatMerchantIdFallback && callbackMerchantIds.length > 0;
    if (!merchantMatches) {
      await updateCallbackLog(logId, "validation_failed", "Callback merchant_id does not match payment intent.");
      return ok({ status: "validation_failed" });
    }
    if (!isSameAmount(Number(intent.amount), receiveAmount)) {
      await updateCallbackLog(logId, "validation_failed", "Callback amount does not match payment intent.");
      return ok({ status: "validation_failed" });
    }
    if (intent.status === "paid") {
      await updateCallbackLog(logId, "duplicate");
      return ok({ status: "duplicate" });
    }
    if (intent.status !== "pending") {
      await updateCallbackLog(logId, "duplicate", `Payment intent status is ${intent.status}.`);
      return ok({ status: "duplicate" });
    }
    if (responseCode !== 0 && responseCode !== 1) {
      await updateCallbackLog(logId, "validation_failed", `Unsupported INET response_code: ${responseCode}.`);
      return ok({ status: "validation_failed" });
    }

    void appendAuditLog({
      tenantId: intent.tenant_id,
      branchId: intent.branch_id,
      actorUserId: intent.created_by ?? "00000000-0000-0000-0000-000000000000",
      actorRole: "tenant_user",
      action: "inet_payment_callback_received",
      targetTable: "pos_payment_intents",
      targetId: intent.id,
      metadata: { provider_order_id: providerOrderId, response_code: responseCode, receive_amount: receiveAmount }
    });

    if (responseCode === 1) {
      const { data: failedIntent, error: failedIntentError } = await supabase
        .from("pos_payment_intents")
        .update({
          status: "failed",
          failed_reason: `inet_response_code:${responseCode}${responseMessage ? `:${responseMessage}` : ""}`,
          inet_payment_reference_id: paymentReferenceId
        })
        .eq("id", intent.id)
        .eq("status", "pending")
        .is("failed_reason", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (failedIntentError) throw new Error(failedIntentError.message);
      if (!failedIntent?.id) {
        await updateCallbackLog(logId, "duplicate", "Payment intent was already processed.");
        return ok({ status: "duplicate" });
      }
      await updateCallbackLog(logId, "processed");
      void appendAuditLog({
        tenantId: intent.tenant_id,
        branchId: intent.branch_id,
        actorUserId: intent.created_by ?? "00000000-0000-0000-0000-000000000000",
        actorRole: "tenant_user",
        action: "inet_payment_failed",
        targetTable: "pos_payment_intents",
        targetId: intent.id,
        metadata: { provider_order_id: providerOrderId, response_code: responseCode }
      });
      return ok({ status: "processed" });
    }

    const claim = await claimPendingPaymentIntent(intent);
    if (!claim) {
      await updateCallbackLog(logId, "duplicate", "Payment intent is already being processed.");
      return ok({ status: "duplicate" });
    }

    const claimedIntent = claim.intent;
    const auth = buildCallbackAuth(claimedIntent);
    if (!auth) {
      await releasePaymentIntentClaim(claimedIntent, claim.claimId);
      await updateCallbackLog(logId, "error", "Payment intent is missing created_by.");
      return Response.json({ data: null, error: { code: "payment_intent_missing_actor", message: "Payment intent is missing created_by." } }, { status: 500 });
    }

    const paymentReference = paymentReferenceId || providerOrderId;
    const finalizeResult = await finalizePosPayment({
      auth,
      orderId: claimedIntent.order_id,
      amount: Number(claimedIntent.amount),
      method: "bank_transfer",
      referenceNo: `INET:${paymentReference}`,
      requestGroupId: claimedIntent.request_group_id || `inet-${claimedIntent.id}`,
      auditAction: "inet_payment_paid"
    });
    if (!finalizeResult.ok) {
      await releasePaymentIntentClaim(claimedIntent, claim.claimId);
      await updateCallbackLog(logId, "error", finalizeResult.message);
      return Response.json({ data: null, error: { code: finalizeResult.code, message: finalizeResult.message } }, { status: 500 });
    }

    const markedPaid = await markPaymentIntentPaid(claimedIntent, claim.claimId, paymentReferenceId);
    if (!markedPaid) {
      const message = "Payment intent claim was lost before settlement state could be saved.";
      await updateCallbackLog(logId, "error", message);
      return Response.json({ data: null, error: { code: "payment_intent_update_failed", message } }, { status: 500 });
    }

    await updateCallbackLog(logId, "processed");
    return ok({ status: "processed" });
  } catch (error) {
    return Response.json(
      { data: null, error: { code: "inet_callback_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
