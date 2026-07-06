import { describe, expect, it, vi } from "vitest";
import type { CreateManualDeliveryOrderInput } from "@pos/shared-types";

const getAuthContext = vi.fn();
const executeCreateManualDeliveryOrderTransaction = vi.fn();
const enqueueOrderPrintJobs = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  getAuthContext
}));

vi.mock("@/lib/services/stock-transaction-service", () => ({
  executeCreateManualDeliveryOrderTransaction
}));

vi.mock("@/lib/printing/print-service", () => ({
  enqueueOrderPrintJobs
}));

describe("orders payment flow with print failure", () => {
  it("returns order success even when print queue fails", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "manager"
    });

    executeCreateManualDeliveryOrderTransaction.mockResolvedValue({
      ok: true,
      data: {
        id: "order-001",
        status: "queued",
        created_at: new Date().toISOString(),
        duplicate_request: false
      }
    });

    enqueueOrderPrintJobs.mockRejectedValue(new Error("printer_offline"));

    const payload: CreateManualDeliveryOrderInput = {
      tenant_id: "t1",
      branch_id: "b1",
      shift_id: "s1",
      channel: "grab",
      external_order_code: "G-1001",
      customer_name: "Test",
      notes: "test",
      app_total_amount: 120,
      discount_amount: 0,
      gp_amount: 0,
      items: [{ product_id: "p1", quantity: 1 }]
    };

    const { POST } = await import("@/app/api/backoffice/orders/route");
    const response = await POST(
      new Request("http://localhost/api/backoffice/orders", {
        method: "POST",
        body: JSON.stringify(payload)
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("order-001");
    expect(body.data.print_warning).toBe("printer_offline");
    expect(body.data.print_jobs_queued).toBe(0);
  });
});
