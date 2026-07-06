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
    or: vi.fn(() => query),
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(result))
  };

  return query;
}

describe("staff and audit api access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects staff role on staff management endpoint", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "staff"
    });

    const { GET } = await import("@/app/api/backoffice/staff/route");
    const response = await GET(new Request("http://localhost/api/backoffice/staff"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden_role");
  });

  it("allows manager role and returns paginated staff list", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "manager"
    });

    const rows = [
      {
        id: "r1",
        user_id: "u2",
        role: "staff",
        is_default: false,
        users_profiles: {
          id: "u2",
          full_name: "Staff User",
          email: "staff@demo.local",
          is_active: true,
          platform_role: "tenant_user"
        }
      }
    ];

    const query = createAwaitableQuery({ data: rows, error: null, count: 1 });
    const from = vi.fn(() => ({ select: vi.fn(() => query) }));
    getSupabaseServiceClient.mockReturnValue({ from });

    const { GET } = await import("@/app/api/backoffice/staff/route");
    const response = await GET(new Request("http://localhost/api/backoffice/staff?page=1&page_size=10&search=staff"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(query.eq).toHaveBeenCalledWith("branch_id", "b1");
  });

  it("rejects staff role on audit logs endpoint", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u1",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "staff"
    });

    const { GET } = await import("@/app/api/backoffice/audit-logs/route");
    const response = await GET(new Request("http://localhost/api/backoffice/audit-logs"));

    expect(response.status).toBe(403);
  });
});
