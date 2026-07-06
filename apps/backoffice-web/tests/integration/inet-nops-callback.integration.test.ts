import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.fn();
const finalizePosPayment = vi.fn();
const getSupabaseServiceClient = vi.fn();

vi.mock("@/lib/audit-log", () => ({ appendAuditLog }));
vi.mock("@/lib/payments/pos-payment-finalize", () => ({ finalizePosPayment }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseServiceClient }));

type IntentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

function createThenableQuery<T>(result: T) {
  const query: Record<string, unknown> = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(result))
  };
  return query;
}

function createSupabaseMock(intentStatus: IntentStatus = "pending", claimedIntent: Record<string, unknown> | null | undefined = undefined) {
  const intent = {
    id: "intent-1",
    tenant_id: "tenant-1",
    branch_id: "branch-1",
    order_id: "order-1",
    provider_order_id: "SST240623152235ABCDEF123456789",
    merchant_id: "M2409200000",
    amount: 100,
    status: intentStatus,
    request_group_id: "inet-request-1",
    created_by: "user-1"
  };
  const selectIntentQuery = {
    eq: vi.fn(() => selectIntentQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: intent, error: null })
  };
  const claimResult = claimedIntent === undefined ? intent : claimedIntent;
  const claimIntentUpdateQuery = createThenableQuery({ data: claimResult, error: null });
  const settledIntentUpdateQuery = createThenableQuery({ data: { id: intent.id }, error: null });
  const intentUpdate = vi.fn()
    .mockImplementationOnce(() => claimIntentUpdateQuery)
    .mockImplementation(() => settledIntentUpdateQuery);
  const logInsertQuery = {
    select: vi.fn(() => logInsertQuery),
    single: vi.fn().mockResolvedValue({ data: { id: "log-1" }, error: null })
  };
  const logInsert = vi.fn(() => logInsertQuery);
  const logUpdateQuery = createThenableQuery({ error: null });
  const logUpdate = vi.fn(() => logUpdateQuery);
  const from = vi.fn((table: string) => {
    if (table === "pos_payment_intents") {
      return {
        select: vi.fn(() => selectIntentQuery),
        update: intentUpdate
      };
    }
    if (table === "pos_payment_callback_logs") {
      return {
        insert: logInsert,
        update: logUpdate
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  getSupabaseServiceClient.mockReturnValue({ from });
  return { intent, intentUpdate, logInsert, logUpdate };
}

function inetSuccessCallback(overrides: Record<string, unknown> = {}) {
  return {
    event: "payment_status_change",
    merchant_id: "M2409200000",
    timestamp: "2024-09-23T11:43:57+07:00",
    retry_flag: "N",
    detail: {
      response_code: 0,
      response_message: "Success",
      merchant_id: "M2409200000",
      order_id: "SST240623152235ABCDEF123456789",
      payment_reference_id: "P24092311432758",
      receive_amount: 100,
      payment_type: "QR Code Payment",
      payment_acquirer_bank: "SCB",
      transaction_date: "20240923",
      transaction_time: "114357",
      order_description: "POS SST-001"
    },
    ...overrides
  };
}

describe("INET NOPS callback integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finalizePosPayment.mockResolvedValue({ ok: true, data: { status: "completed" } });
  });

  it("finalizes a paid QR order from the documented callback payload without a POS confirmation click", async () => {
    const { intentUpdate, logInsert } = createSupabaseMock();
    const { POST } = await import("@/app/api/payments/inet/callback/route");

    const response = await POST(
      new Request("http://localhost/api/payments/inet/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inetSuccessCallback(),
          payer: { account_no: "0123456789", account_name: "Sandbox payer" }
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("processed");
    expect(finalizePosPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        amount: 100,
        method: "bank_transfer",
        referenceNo: "INET:P24092311432758",
        requestGroupId: "inet-request-1"
      })
    );
    expect(intentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid", inet_payment_reference_id: "P24092311432758" })
    );
    expect(logInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        response_message: "Success",
        payment_type: "QR Code Payment",
        raw_payload: expect.not.objectContaining({ payer: expect.anything() })
      })
    );
  });

  it("does not finalize or fail a pending order when a callback merchant does not match", async () => {
    const { intentUpdate } = createSupabaseMock();
    const { POST } = await import("@/app/api/payments/inet/callback/route");
    const payload = inetSuccessCallback();
    payload.merchant_id = "OTHER";
    payload.detail.merchant_id = "OTHER";

    const response = await POST(
      new Request("http://localhost/api/payments/inet/callback", {
        method: "POST",
        body: JSON.stringify(payload)
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("validation_failed");
    expect(finalizePosPayment).not.toHaveBeenCalled();
    expect(intentUpdate).not.toHaveBeenCalled();
  });

  it("treats INET retries after settlement as duplicates and never completes the bill twice", async () => {
    const { logUpdate } = createSupabaseMock("paid");
    const { POST } = await import("@/app/api/payments/inet/callback/route");

    const response = await POST(
      new Request("http://localhost/api/payments/inet/callback", {
        method: "POST",
        body: JSON.stringify(inetSuccessCallback({ retry_flag: "Y" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("duplicate");
    expect(finalizePosPayment).not.toHaveBeenCalled();
    expect(logUpdate).toHaveBeenCalledWith(expect.objectContaining({ processing_status: "duplicate" }));
  });

  it("does not finalize twice when a concurrent callback already holds the pending intent", async () => {
    const { intentUpdate, logUpdate } = createSupabaseMock("pending", null);
    const { POST } = await import("@/app/api/payments/inet/callback/route");

    const response = await POST(
      new Request("http://localhost/api/payments/inet/callback", {
        method: "POST",
        body: JSON.stringify(inetSuccessCallback({ retry_flag: "Y" }))
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("duplicate");
    expect(finalizePosPayment).not.toHaveBeenCalled();
    expect(intentUpdate).toHaveBeenCalledWith(expect.objectContaining({ failed_reason: expect.stringMatching(/^inet_callback_processing:/) }));
    expect(logUpdate).toHaveBeenCalledWith(expect.objectContaining({ processing_status: "duplicate" }));
  });
});
