import { describe, expect, it, vi } from "vitest";
import { reprintOrderReceipt } from "@/lib/printing/print-service";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

function createAwaitableQuery<T>(result: T) {
  const query: Record<string, unknown> = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(result))
  };
  return query;
}

describe("reprint flow", () => {
  it("retries failed receipt job when available", async () => {
    const failedJob = {
      id: "job-failed-1",
      tenant_id: "t1",
      branch_id: "b1",
      order_id: "o1",
      printer_id: "p1",
      printer_role: "receipt",
      connection_type: "NETWORK_ESC_POS",
      status: "failed",
      payload_text: "text",
      payload_json: {},
      retry_count: 3,
      max_retry_count: 3,
      last_error: "offline",
      printed_at: null,
      failed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {}
    };

    const printJobsSelect = createAwaitableQuery({
      data: [failedJob],
      error: null
    });
    const updateSingle = vi.fn(async () => ({
      data: {
        ...failedJob,
        status: "pending",
        retry_count: 0,
        last_error: null,
        failed_at: null
      },
      error: null
    }));
    const updateSelect = vi.fn(() => ({ single: updateSingle }));
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const update = vi.fn(() => ({ eq: updateEq }));

    const from = vi.fn((table: string) => {
      if (table === "print_jobs") {
        return {
          select: vi.fn(() => printJobsSelect),
          update,
          insert: vi.fn()
        };
      }
      return {
        select: vi.fn(),
        update: vi.fn(),
        insert: vi.fn()
      };
    });
    mocks.getSupabaseServiceClient.mockReturnValue({ from });

    const processJob = vi.fn(async (jobId: string) => ({
      ...failedJob,
      id: jobId,
      status: "printed",
      retry_count: 1,
      printed_at: new Date().toISOString(),
      failed_at: null,
      last_error: null
    }));

    const result = await reprintOrderReceipt(
      {
        userId: "u1",
        platformRole: "tenant_user",
        tenantId: "t1",
        branchId: "b1",
        branchRole: "manager"
      },
      "o1",
      { processJob }
    );

    expect(result.mode).toBe("retried_failed_job");
    expect(result.jobs).toHaveLength(1);
    expect(processJob).toHaveBeenCalledWith("job-failed-1");
  });

  it("creates new reprint job when no failed job exists", async () => {
    let printJobSelectCallCount = 0;
    const printJobsSelectEmpty = createAwaitableQuery({
      data: [],
      error: null
    });

    const printerRows = [
      {
        id: "p1",
        tenant_id: "t1",
        branch_id: "b1",
        printer_name: "Receipt LAN",
        printer_role: "receipt",
        connection_type: "NETWORK_ESC_POS",
        ip_address: "192.168.1.50",
        port: 9100,
        paper_width_mm: 58,
        enabled: true,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const printerSelect = createAwaitableQuery({
      data: printerRows,
      error: null
    });
    const orderItemsSelect = createAwaitableQuery({
      data: [
        {
          product_id: "prod-1",
          name: "Noodles",
          quantity: 2,
          unit_price: 60,
          line_total: 120
        }
      ],
      error: null
    });
    const paymentsSelect = createAwaitableQuery({
      data: [
        {
          method: "cash",
          amount: 120,
          created_at: new Date().toISOString()
        }
      ],
      error: null
    });
    const branchMaybeSingle = vi.fn(async () => ({
      data: { name: "Branch POS" },
      error: null
    }));
    const cashierMaybeSingle = vi.fn(async () => ({
      data: { full_name: "Cashier One" },
      error: null
    }));

    const orderMaybeSingle = vi.fn(async () => ({
      data: {
        id: "o2",
        order_no: "DLV-2",
        subtotal: 120,
        total_amount: 120,
        grand_total: 120,
        discount_amount: 0,
        gp_amount: 0,
        tax_total: 0,
        notes: null,
        created_by: "u1",
        payment_completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      error: null
    }));

    const insertSingle = vi.fn(async () => ({
      data: {
        id: "job-new-1",
        tenant_id: "t1",
        branch_id: "b1",
        order_id: "o2",
        printer_id: "p1",
        printer_role: "receipt",
        connection_type: "NETWORK_ESC_POS",
        status: "pending",
        payload_text: "payload",
        payload_json: {},
        retry_count: 0,
        max_retry_count: 3,
        last_error: null,
        printed_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { reprint: true }
      },
      error: null
    }));

    const from = vi.fn((table: string) => {
      if (table === "print_jobs") {
        return {
          select: vi.fn(() => {
            printJobSelectCallCount += 1;
            return printJobsSelectEmpty;
          }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertSingle
            }))
          })),
          update: vi.fn()
        };
      }

      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: orderMaybeSingle
                }))
              }))
            }))
          }))
        };
      }

      if (table === "printer_profiles") {
        return {
          select: vi.fn(() => printerSelect)
        };
      }

      if (table === "order_items") {
        return {
          select: vi.fn(() => orderItemsSelect)
        };
      }

      if (table === "payments") {
        return {
          select: vi.fn(() => paymentsSelect)
        };
      }

      if (table === "branches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: branchMaybeSingle
              }))
            }))
          }))
        };
      }

      if (table === "users_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: cashierMaybeSingle
            }))
          }))
        };
      }

      return {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn()
      };
    });
    mocks.getSupabaseServiceClient.mockReturnValue({ from });

    const processJob = vi.fn(async (jobId: string) => ({
      id: jobId,
      tenant_id: "t1",
      branch_id: "b1",
      order_id: "o2",
      printer_id: "p1",
      printer_role: "receipt",
      connection_type: "NETWORK_ESC_POS",
      status: "printed",
      payload_text: "payload",
      payload_json: {},
      retry_count: 1,
      max_retry_count: 3,
      last_error: null,
      printed_at: new Date().toISOString(),
      failed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {}
    }));

    const result = await reprintOrderReceipt(
      {
        userId: "u1",
        platformRole: "tenant_user",
        tenantId: "t1",
        branchId: "b1",
        branchRole: "owner"
      },
      "o2",
      { processJob }
    );

    expect(printJobSelectCallCount).toBe(1);
    expect(result.mode).toBe("created_new_job");
    expect(result.jobs).toHaveLength(1);
    expect(processJob).toHaveBeenCalledWith("job-new-1");
  });
});
