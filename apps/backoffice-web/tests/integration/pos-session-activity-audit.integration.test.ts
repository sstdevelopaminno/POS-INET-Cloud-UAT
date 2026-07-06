import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePosSession = vi.fn();
const writeAuditLog = vi.fn();
const clearPreEntryFlowState = vi.fn();

vi.mock("@/lib/pos-session-guard", () => ({
  PosGuardError: class PosGuardError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  requirePosSession
}));
vi.mock("@/lib/server/audit-log", () => ({
  getRequestMeta: () => ({ ipAddress: "127.0.0.1", userAgent: "vitest" }),
  writeAuditLog
}));
vi.mock("@/lib/server/pre-entry-state", () => ({
  clearPreEntryFlowState,
  createFlowState: vi.fn(),
  readPreEntryFlowState: vi.fn(),
  writePreEntryFlowState: vi.fn()
}));
vi.mock("@/lib/server/pre-entry-auth", () => ({ resolveEmployeeByUserId: vi.fn() }));
vi.mock("@/lib/server/auth-timeout", () => ({
  withAuthTimeout: <T>(promise: Promise<T>) => promise
}));
vi.mock("@/lib/server/pos-session", () => ({
  resolveSessionCookieConfig: () => ({
    name: "pos_session",
    sessionIdName: "pos_session_id",
    secure: false,
    domain: undefined
  })
}));

function createUpdateQuery() {
  const result = Promise.resolve({ data: null, error: null });
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    then: result.then.bind(result)
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

const updateQuery = createUpdateQuery();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseServiceClient: () => ({
    from: () => updateQuery
  })
}));

describe("POS session activity audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateQuery.update.mockReturnValue(updateQuery);
    updateQuery.eq.mockReturnValue(updateQuery);
  });

  it("records the device, user, session, and server logout time", async () => {
    requirePosSession.mockResolvedValue({
      session: {
        id: "session-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        user_id: "staff-1",
        role: "staff",
        device_id: "device-1",
        device_code: "BKK-01-POS-01",
        shift_id: "shift-1",
        status: "active",
        expires_at: "2026-06-08T00:00:00.000Z"
      },
      user: { id: "staff-1", full_name: "Staff One", is_active: true },
      branch: { id: "branch-1", name: "Branch One", code: "BKK-01" },
      tenant: { id: "tenant-1", name: "Store One", code: "STORE-1", is_active: true },
      permissions: []
    });

    const { POST } = await import("@/app/api/auth/session/logout/route");
    const response = await POST(
      new Request("http://localhost/api/auth/session/logout", {
        method: "POST",
        body: JSON.stringify({ mode: "full" })
      })
    );

    expect(response.status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        branchId: "branch-1",
        actorUserId: "staff-1",
        actorRole: "staff",
        deviceCode: "BKK-01-POS-01",
        posSessionId: "session-1",
        action: "session_logout",
        targetType: "pos_session",
        metadata: expect.objectContaining({
          device_code: "BKK-01-POS-01",
          logout_mode: "full",
          logged_out_at: expect.any(String)
        })
      })
    );
  });
});
