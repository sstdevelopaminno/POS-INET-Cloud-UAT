import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthContext = vi.fn();
const getSupabaseServiceClient = vi.fn();
const appendAuditLog = vi.fn(async () => ({ inserted: true }));

vi.mock("@/lib/auth-context", () => ({ getAuthContext }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseServiceClient }));
vi.mock("@/lib/audit-log", () => ({ appendAuditLog }));

type QueryResult<T> = {
  data: T;
  error: null;
};

type ChainableQuery<T> = {
  select: (column?: string) => ChainableQuery<T>;
  eq: (column: string, value: unknown) => ChainableQuery<T>;
  in: (column: string, values: unknown[]) => ChainableQuery<T>;
  order: (column: string, options?: unknown) => ChainableQuery<T>;
  then: Promise<QueryResult<T>>["then"];
};

function createChainableQuery<T>(result: QueryResult<T>): ChainableQuery<T> {
  const query = {} as ChainableQuery<T>;
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(() => query);
  const promise = Promise.resolve(result);
  query.then = promise.then.bind(promise);
  return query;
}

describe("table management permission rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks staff role from creating table setup", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u-staff",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "staff"
    });

    const { POST } = await import("@/app/api/backoffice/tables/route");
    const response = await POST(
      new Request("http://localhost/api/backoffice/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_code: "A1" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden_role");
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("allows manager role to create table setup", async () => {
    getAuthContext.mockResolvedValue({
      userId: "u-manager",
      platformRole: "tenant_user",
      tenantId: "t1",
      branchId: "b1",
      branchRole: "manager"
    });

    const single = vi.fn(async () => ({
      data: {
        id: "tb1",
        table_code: "A1",
        zone_id: null
      },
      error: null
    }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const roleQuery = createChainableQuery({
      data: [{ branch_id: "b1", role: "manager" }],
      error: null
    });
    const branchQuery = createChainableQuery({
      data: [{ id: "b1", code: "B1", name: "Branch 1", is_active: true }],
      error: null
    });
    const from = vi.fn((tableName: string) => {
      if (tableName === "user_branch_roles") return roleQuery;
      if (tableName === "branches") return branchQuery;
      return { insert };
    });
    getSupabaseServiceClient.mockReturnValue({ from });

    const { POST } = await import("@/app/api/backoffice/tables/route");
    const response = await POST(
      new Request("http://localhost/api/backoffice/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_code: "A1", capacity: 4 })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("tb1");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0]?.[0]?.action).toBe("table_created");
  });
});
