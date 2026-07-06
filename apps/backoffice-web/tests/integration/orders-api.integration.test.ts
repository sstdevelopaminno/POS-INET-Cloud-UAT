import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthContext = vi.fn();
const getSupabaseServiceClient = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  getAuthContext
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseServiceClient
}));

function createAwaitableQuery<T>(result: T) {
  const query: Record<string, unknown> = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(result))
  };

  return query;
}

describe("orders api integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated orders with tenant and branch filtering", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "staff"
    });

    const rows = [
      {
        id: "o1",
        order_no: "DLV-1",
        order_type: "delivery_manual",
        channel: "grab",
        external_order_code: "G-1",
        customer_name: "John",
        total_amount: 100,
        status: "queued",
        created_at: new Date().toISOString()
      }
    ];

    const ordersQuery = createAwaitableQuery({ data: rows, error: null, count: 1 });
    const verificationsQuery = createAwaitableQuery({ data: [], error: null });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => (table === "orders" ? ordersQuery : verificationsQuery))
    }));
    getSupabaseServiceClient.mockReturnValue({ from });

    const { GET } = await import("@/app/api/backoffice/orders/route");
    const response = await GET(new Request("http://localhost/api/backoffice/orders?page=1&page_size=10&search=DLV"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
    expect(ordersQuery.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(ordersQuery.eq).toHaveBeenCalledWith("branch_id", "b1");
    expect(ordersQuery.or).toHaveBeenCalledTimes(1);
    expect(verificationsQuery.in).toHaveBeenCalledWith("order_id", ["o1"]);
  });

  it("blocks cross branch query", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "staff"
    });

    const from = vi.fn();
    getSupabaseServiceClient.mockReturnValue({ from });

    const { GET } = await import("@/app/api/backoffice/orders/route");
    const response = await GET(new Request("http://localhost/api/backoffice/orders?branch_id=b2"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden_branch_scope");
    expect(from).not.toHaveBeenCalled();
  });
});
