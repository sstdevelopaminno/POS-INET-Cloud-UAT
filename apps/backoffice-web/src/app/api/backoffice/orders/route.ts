import type { CreateManualDeliveryOrderInput } from "@pos/shared-types";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { executeCreateManualDeliveryOrderTransaction } from "@/lib/services/stock-transaction-service";
import { buildPaginationMeta, parsePagination, sanitizeSearchTerm } from "@/lib/query-params";
import { ok, fail } from "@/lib/http";
import { enqueueOrderPrintJobs } from "@/lib/printing/print-service";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const { page, pageSize } = parsePagination(searchParams, 10);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = sanitizeSearchTerm(searchParams.get("search"));
    const status = searchParams.get("status")?.trim();
    const orderType = searchParams.get("order_type")?.trim();
    const channel = searchParams.get("channel")?.trim();
    const branchId = searchParams.get("branch_id")?.trim();

    if (branchId && branchId !== auth.branchId) {
      return fail("forbidden_branch_scope", "Cross-branch access is not allowed.", 403);
    }

    let query = supabase
      .from("orders")
      .select(
        "id,tenant_id,branch_id,shift_id,order_no,order_type,channel,external_order_code,customer_name,total_amount,status,created_at,delivery_status",
        { count: "exact" }
      )
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }

    if (orderType) {
      query = query.eq("order_type", orderType);
    }

    if (channel) {
      query = query.eq("channel", channel);
    }

    if (search) {
      query = query.or(
        `order_no.ilike.%${search}%,external_order_code.ilike.%${search}%,customer_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return fail("orders_query_failed", error.message, 500);
    }

    const orderRows =
      (data as Array<{
        id: string;
        order_no: string;
        order_type: string;
        channel: string;
        external_order_code: string | null;
        customer_name: string | null;
        total_amount: number;
        status: string;
        created_at: string;
        delivery_status: string | null;
      }>) ?? [];

    const orderIds = orderRows.map((row) => row.id);
    const verificationMap = new Map<
      string,
      {
        verification_status: string;
        parsed_amount: number | null;
        parsed_payer_name: string | null;
        parsed_payee_name: string | null;
        parsed_reference_no: string | null;
        parsed_transaction_id: string | null;
        verified_at: string;
        override_approval_id: string | null;
      }
    >();

    if (orderIds.length > 0) {
      const { data: verificationRows, error: verificationError } = await supabase
        .from("transfer_payment_verifications")
        .select(
          "order_id,verification_status,parsed_amount,parsed_payer_name,parsed_payee_name,parsed_reference_no,parsed_transaction_id,verified_at,override_approval_id"
        )
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .in("order_id", orderIds)
        .order("verified_at", { ascending: false });

      if (verificationError) {
        const missingTable =
          verificationError.message.toLowerCase().includes("transfer_payment_verifications") &&
          verificationError.message.toLowerCase().includes("does not exist");
        if (!missingTable) {
          return fail("transfer_verifications_query_failed", verificationError.message, 500);
        }
      } else {
        for (const row of (verificationRows ??
          []) as Array<{
          order_id: string;
          verification_status: string;
          parsed_amount: number | null;
          parsed_payer_name: string | null;
          parsed_payee_name: string | null;
          parsed_reference_no: string | null;
          parsed_transaction_id: string | null;
          verified_at: string;
          override_approval_id: string | null;
        }>) {
          if (!verificationMap.has(row.order_id)) {
            verificationMap.set(row.order_id, {
              verification_status: row.verification_status,
              parsed_amount: row.parsed_amount,
              parsed_payer_name: row.parsed_payer_name,
              parsed_payee_name: row.parsed_payee_name,
              parsed_reference_no: row.parsed_reference_no,
              parsed_transaction_id: row.parsed_transaction_id,
              verified_at: row.verified_at,
              override_approval_id: row.override_approval_id
            });
          }
        }
      }
    }

    const enrichedItems = orderRows.map((row) => ({
      ...row,
      transfer_verification: verificationMap.get(row.id) ?? null
    }));

    return ok({
      items: enrichedItems,
      pagination: buildPaginationMeta(page, pageSize, count)
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as CreateManualDeliveryOrderInput & {
      print_kitchen_ticket?: boolean;
      payment_method?: "cash" | "bank_transfer";
    };
    const auth = await getAuthContext({ requireBranchScope: true });

    if (!payload.external_order_code?.trim()) {
      return fail("invalid_external_code", "External order code is required.", 422);
    }

    if (!["grab", "line_man", "shopee", "merchant_app", "other"].includes(payload.channel)) {
      return fail("invalid_channel", "Manual delivery channel is invalid.", 422);
    }

    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || undefined;

    const result = await executeCreateManualDeliveryOrderTransaction({
      auth,
      input: payload,
      idempotencyKey,
      appendAuditLog
    });

    if (!result.ok) {
      return fail(result.code, result.message, result.status);
    }

    let printJobsQueued = 0;
    let printWarning: string | null = null;
    try {
      const jobs = await enqueueOrderPrintJobs({
        auth,
        orderId: result.data.id,
        orderNo: result.data.id,
        paymentMethod: payload.payment_method ?? "cash",
        input: payload,
        includeKitchenTicket: payload.print_kitchen_ticket === true
      });
      printJobsQueued = jobs.length;
    } catch (printError) {
      printWarning = printError instanceof Error ? printError.message : "print_queue_failed";
    }

    return ok(
      {
        ...result.data,
        print_jobs_queued: printJobsQueued,
        print_warning: printWarning
      },
      result.data.duplicate_request ? 200 : 201
    );
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

