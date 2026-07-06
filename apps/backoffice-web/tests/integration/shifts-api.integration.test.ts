import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthContext = vi.fn();
const getSupabaseServiceClient = vi.fn();
const appendAuditLog = vi.fn(async () => ({ inserted: true }));
const executeShiftClose = vi.fn();

vi.mock("@/lib/auth-context", () => ({ getAuthContext }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseServiceClient }));
vi.mock("@/lib/audit-log", () => ({ appendAuditLog }));
vi.mock("@/lib/services/shift-close-service", () => ({ executeShiftClose }));

function createAwaitableQuery<T>(result: T) {
  const query: Record<string, unknown> = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(result))
  };

  return query;
}

describe("shifts api integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "manager"
    });
  });

  it("lists shifts with pagination", async () => {
    const query = createAwaitableQuery({ data: [{ id: "s1", status: "open" }], error: null, count: 1 });
    const from = vi.fn(() => ({ select: vi.fn(() => query) }));
    getSupabaseServiceClient.mockReturnValue({ from });

    const { GET } = await import("@/app/api/backoffice/shifts/route");
    const response = await GET(new Request("http://localhost/api/backoffice/shifts?page=1&page_size=10"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(query.eq).toHaveBeenCalledWith("branch_id", "b1");
  });

  it("closes shift using real order query and db update path", async () => {
    const ordersQuery = createAwaitableQuery({ data: [], error: null });
    const updateEq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: updateEq })) })) }));

    const from = vi.fn((table: string) => {
      if (table === "orders") {
        return { select: vi.fn(() => ordersQuery) };
      }

      if (table === "shifts") {
        return { update };
      }

      return { select: vi.fn(() => ordersQuery) };
    });

    getSupabaseServiceClient.mockReturnValue({ from });
    executeShiftClose.mockResolvedValue({
      ok: true,
      data: {
        shift_id: "s1",
        status: "closed",
        closed_at: new Date().toISOString()
      }
    });

    const { POST } = await import("@/app/api/backoffice/shifts/close/route");
    const response = await POST(
      new Request("http://localhost/api/backoffice/shifts/close", {
        method: "POST",
        body: JSON.stringify({ shift_id: "s1", expected_cash: 100, actual_cash: 100 }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(executeShiftClose).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
