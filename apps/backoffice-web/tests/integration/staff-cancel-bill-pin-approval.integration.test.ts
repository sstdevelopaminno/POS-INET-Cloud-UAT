import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const getSupabaseServiceClient = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseServiceClient }));
vi.mock("@/lib/env", () => ({ readEnv: () => undefined }));

function queryResult(data: unknown[], error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: result.then.bind(result)
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe("staff cancel-bill PIN approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an enabled branch-scoped staff PIN for cancel_bill", async () => {
    const staffPinHash = await bcrypt.hash("7890", 4);
    const managerOwnerCandidates = queryResult([]);
    const staffCandidates = queryResult([
      {
        role: "staff",
        user_id: "staff-1",
        users_profiles: {
          is_active: true
        }
      }
    ]);
    const permissionRows = queryResult([{ user_id: "staff-1", pin_hash: staffPinHash }]);
    const userBranchRoleQueries = [managerOwnerCandidates, staffCandidates];
    const from = vi.fn((table: string) => {
      if (table === "pos_user_approval_permissions") return permissionRows;
      if (table === "user_branch_roles") return userBranchRoleQueries.shift() ?? queryResult([]);
      return queryResult([]);
    });

    getSupabaseServiceClient.mockReturnValue({
      from
    });

    const { validateManagerPin } = await import("@/lib/pin-approval");
    expect(await bcrypt.compare("7890", staffPinHash)).toBe(true);
    const result = await validateManagerPin("cancel_bill", "7890", {
      tenantId: "tenant-1",
      branchId: "branch-1"
    });

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "user_branch_roles",
      "users_profiles",
      "pos_user_approval_permissions",
      "user_branch_roles"
    ]);
    expect(result).toEqual({
      approved: true,
      approverUserId: "staff-1",
      approverRole: "staff"
    });
  });

  it("does not use staff authority for another protected action", async () => {
    getSupabaseServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user_branch_roles") return queryResult([]);
        if (table === "users_profiles") return queryResult([]);
        return queryResult([]);
      })
    });

    const { validateManagerPin } = await import("@/lib/pin-approval");
    const result = await validateManagerPin("stock_adjustment", "7890", {
      tenantId: "tenant-1",
      branchId: "branch-1"
    });

    expect(result).toEqual({ approved: false });
  });
});
