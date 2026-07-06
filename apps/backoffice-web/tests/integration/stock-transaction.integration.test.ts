import { describe, expect, it, vi } from "vitest";
import type { CreateManualDeliveryOrderInput } from "@pos/shared-types";
import {
  executeCreateManualDeliveryOrderTransaction,
  executeStockAdjustmentTransaction
} from "@/lib/services/stock-transaction-service";

const auth = {
  userId: "00000000-0000-0000-0000-000000000103",
  platformRole: "tenant_user" as const,
  tenantId: "00000000-0000-0000-0000-000000000001",
  branchId: "00000000-0000-0000-0000-000000000011",
  branchRole: "staff" as const
};

const baseOrderInput: CreateManualDeliveryOrderInput = {
  tenant_id: auth.tenantId,
  branch_id: auth.branchId,
  shift_id: "00000000-0000-0000-0000-000000000201",
  channel: "grab",
  external_order_code: "G-TEST-001",
  customer_name: "QA Customer",
  notes: "integration-test",
  app_total_amount: 120,
  gp_amount: 10,
  discount_amount: 0,
  items: [
    {
      product_id: "00000000-0000-0000-0000-000000001001",
      quantity: 1
    }
  ]
};

describe("stock transaction service", () => {
  it("handles concurrent orders so only one succeeds when stock is limited", async () => {
    const appendAuditLog = vi.fn(async () => undefined);

    let stockRemaining = 1;
    const invokeRpc = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));

      if (stockRemaining <= 0) {
        return {
          data: null,
          error: { message: "INSUFFICIENT_STOCK:00000000-0000-0000-0000-000000009999" }
        };
      }

      stockRemaining -= 1;
      return {
        data: [
          {
            order_id: crypto.randomUUID(),
            order_status: "queued",
            created_at: new Date().toISOString(),
            duplicate_request: false
          }
        ],
        error: null
      };
    });

    const [a, b] = await Promise.all([
      executeCreateManualDeliveryOrderTransaction({
        auth,
        input: { ...baseOrderInput, external_order_code: "G-CONCURRENT-1" },
        appendAuditLog,
        invokeRpc
      }),
      executeCreateManualDeliveryOrderTransaction({
        auth,
        input: { ...baseOrderInput, external_order_code: "G-CONCURRENT-2" },
        appendAuditLog,
        invokeRpc
      })
    ]);

    const successCount = [a, b].filter((result) => result.ok).length;
    const failCount = [a, b].filter((result) => !result.ok).length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
    expect([a, b].some((result) => !result.ok && result.code === "insufficient_stock")).toBe(true);
  });

  it("returns duplicate_request=true when same idempotency key is replayed", async () => {
    const appendAuditLog = vi.fn(async () => undefined);
    const orderByRequest = new Map<string, string>();

    const invokeRpc = vi.fn(async (_fn: string, params: Record<string, unknown>) => {
      const requestId = String(params.p_request_id ?? "");

      if (orderByRequest.has(requestId)) {
        return {
          data: [
            {
              order_id: orderByRequest.get(requestId),
              order_status: "queued",
              created_at: new Date().toISOString(),
              duplicate_request: true
            }
          ],
          error: null
        };
      }

      const id = crypto.randomUUID();
      orderByRequest.set(requestId, id);

      return {
        data: [
          {
            order_id: id,
            order_status: "queued",
            created_at: new Date().toISOString(),
            duplicate_request: false
          }
        ],
        error: null
      };
    });

    const first = await executeCreateManualDeliveryOrderTransaction({
      auth,
      input: { ...baseOrderInput, external_order_code: "G-IDEMP-1" },
      idempotencyKey: "same-key-001",
      appendAuditLog,
      invokeRpc
    });

    const second = await executeCreateManualDeliveryOrderTransaction({
      auth,
      input: { ...baseOrderInput, external_order_code: "G-IDEMP-1" },
      idempotencyKey: "same-key-001",
      appendAuditLog,
      invokeRpc
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.id).toBe(first.data.id);
      expect(second.data.duplicate_request).toBe(true);
    }

    const actions = appendAuditLog.mock.calls.map((call) => call[0]?.action);
    expect(actions).toContain("manual_delivery_order_created");
    expect(actions).toContain("manual_delivery_order_replayed");
  });

  it("maps rollback-safe transaction failures without crashing flow", async () => {
    const appendAuditLog = vi.fn(async () => undefined);

    const result = await executeCreateManualDeliveryOrderTransaction({
      auth,
      input: { ...baseOrderInput, external_order_code: "G-ROLLBACK-1" },
      appendAuditLog,
      invokeRpc: async () => ({
        data: null,
        error: { message: "INSUFFICIENT_STOCK:rollback-case" }
      })
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_stock");
      expect(result.status).toBe(409);
    }

    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0]?.[0]?.action).toBe("manual_delivery_order_failed");
  });

  it("rejects stock adjustment when deduction would go negative", async () => {
    const appendAuditLog = vi.fn(async () => undefined);

    const result = await executeStockAdjustmentTransaction({
      auth,
      input: {
        ingredient_id: "00000000-0000-0000-0000-000000002001",
        quantity_delta: -999,
        reason: "qa-negative",
        approval_id: "00000000-0000-0000-0000-000000003001",
        request_id: "adj-request-001"
      },
      appendAuditLog,
      invokeRpc: async () => ({
        data: null,
        error: { message: "INSUFFICIENT_STOCK:00000000-0000-0000-0000-000000002001" }
      })
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_stock");
      expect(result.status).toBe(409);
    }
    expect(appendAuditLog.mock.calls[0]?.[0]?.action).toBe("stock_adjustment_failed");
  });
});
