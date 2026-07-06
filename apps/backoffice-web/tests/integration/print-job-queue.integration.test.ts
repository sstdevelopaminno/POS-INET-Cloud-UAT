import { describe, expect, it, vi } from "vitest";
import { enqueuePrintJob } from "@/lib/printing/print-service";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

describe("print job queue creation", () => {
  it("creates pending print job with retry configuration", async () => {
    const single = vi.fn(async () => ({
      data: {
        id: "job-1",
        tenant_id: "t1",
        branch_id: "b1",
        order_id: "o1",
        printer_id: "p1",
        printer_role: "receipt",
        connection_type: "NETWORK_ESC_POS",
        status: "pending",
        payload_text: "test",
        payload_json: {},
        retry_count: 0,
        max_retry_count: 3,
        last_error: null,
        printed_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {}
      },
      error: null
    }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    mocks.getSupabaseServiceClient.mockReturnValue({ from });

    const result = await enqueuePrintJob({
      auth: {
        userId: "u1",
        platformRole: "tenant_user",
        tenantId: "t1",
        branchId: "b1",
        branchRole: "manager"
      },
      printer: {
        id: "p1",
        tenant_id: "t1",
        branch_id: "b1",
        printer_name: "Kitchen A",
        printer_role: "receipt",
        connection_type: "NETWORK_ESC_POS",
        ip_address: "192.168.1.25",
        port: 9100,
        paper_width_mm: 58,
        enabled: true,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      orderId: "o1",
      printerRole: "receipt",
      payloadText: "hello",
      maxRetryCount: 3
    });

    expect(result.status).toBe("pending");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      tenant_id: "t1",
      branch_id: "b1",
      order_id: "o1",
      printer_id: "p1",
      max_retry_count: 3,
      status: "pending"
    });
  });
});
