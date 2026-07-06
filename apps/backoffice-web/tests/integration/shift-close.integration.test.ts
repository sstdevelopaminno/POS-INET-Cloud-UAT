import { describe, expect, it, vi } from "vitest";
import type { Order } from "@pos/shared-types";
import { executeShiftClose } from "@/lib/services/shift-close-service";

describe("executeShiftClose", () => {
  const auth = {
    userId: "u-manager",
    platformRole: "tenant_user" as const,
    tenantId: "t1",
    branchId: "b1",
    branchRole: "manager" as const
  };

  const openDineInOrders: Order[] = [
    {
      id: "o1",
      tenant_id: "t1",
      branch_id: "b1",
      shift_id: "s1",
      order_no: "DINE-001",
      order_type: "dine_in",
      channel: "storefront",
      table_id: "tb1",
      external_order_code: null,
      customer_name: null,
      notes: null,
      subtotal: 100,
      discount_amount: 0,
      gp_amount: 0,
      total_amount: 100,
      status: "preparing",
      created_by: "u-staff",
      cancelled_by: null,
      cancelled_reason: null,
      created_at: new Date().toISOString()
    }
  ];

  it("blocks shift close when unpaid dine-in exists and no override", async () => {
    const appendAuditLog = vi.fn(async () => undefined);

    const result = await executeShiftClose({
      auth,
      input: {
        shift_id: "s1",
        expected_cash: 1000,
        actual_cash: 1000
      },
      openOrders: openDineInOrders,
      appendAuditLog
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("shift_close_blocked");
    }
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0]?.[0]?.action).toBe("shift_close_blocked");
  });

  it("allows close when override is provided", async () => {
    const appendAuditLog = vi.fn(async () => undefined);

    const result = await executeShiftClose({
      auth,
      input: {
        shift_id: "s1",
        expected_cash: 1000,
        actual_cash: 1000,
        manager_override_approval_id: "ap1"
      },
      openOrders: openDineInOrders,
      appendAuditLog
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("closed");
    }
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0]?.[0]?.action).toBe("shift_closed");
  });
});

