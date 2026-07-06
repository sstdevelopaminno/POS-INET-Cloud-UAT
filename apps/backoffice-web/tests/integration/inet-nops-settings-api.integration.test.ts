import { beforeEach, describe, expect, it, vi } from "vitest";

const getPosApiAuthContext = vi.fn();
const loadInetNopsSettings = vi.fn();
const saveInetNopsSettings = vi.fn();
const testInetNopsProviderConnection = vi.fn();

vi.mock("@/lib/pos-api-auth", () => ({ getPosApiAuthContext }));
vi.mock("@/lib/services/inet-nops-settings-service", () => ({
  loadInetNopsSettings,
  saveInetNopsSettings,
  testInetNopsProviderConnection
}));

const auth = {
  userId: "user-1",
  tenantId: "tenant-1",
  branchId: "branch-1",
  branchRole: "owner",
  platformRole: "tenant_user"
};

const settings = {
  branch_id: "branch-1",
  environment: "uat",
  merchant_id: "",
  is_active: false,
  connection_status: "not_configured",
  last_connection_checked_at: null,
  last_connection_error: "",
  last_test_order_id: "",
  callback_url: "https://uat.example.com/api/payments/inet/callback",
  callback_is_public: true,
  merchant_key_configured: true,
  feature_enabled: true,
  schema_ready: true
};

describe("INET NOPS settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPosApiAuthContext.mockResolvedValue(auth);
  });

  it("loads branch-scoped INET QR settings", async () => {
    loadInetNopsSettings.mockResolvedValue(settings);
    const { GET } = await import("@/app/api/pos/settings/inet-nops/route");

    const response = await GET(new Request("http://localhost/api/pos/settings/inet-nops?branch_id=branch-2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.settings.callback_url).toBe(settings.callback_url);
    expect(loadInetNopsSettings).toHaveBeenCalledWith(auth, "branch-2");
  });

  it("saves the branch INET QR activation and environment", async () => {
    saveInetNopsSettings.mockResolvedValue({ ...settings, is_active: true });
    const { PUT } = await import("@/app/api/pos/settings/inet-nops/route");
    const payload = { branch_id: "branch-1", environment: "uat", merchant_id: "M-uat", is_active: true };

    const response = await PUT(new Request("http://localhost/api/pos/settings/inet-nops", { method: "PUT", body: JSON.stringify(payload) }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.settings.is_active).toBe(true);
    expect(saveInetNopsSettings).toHaveBeenCalledWith(auth, payload);
  });

  it("runs only the explicit UAT connection-test action", async () => {
    testInetNopsProviderConnection.mockResolvedValue({ ...settings, connection_status: "ready" });
    const { POST } = await import("@/app/api/pos/settings/inet-nops/route");

    const success = await POST(
      new Request("http://localhost/api/pos/settings/inet-nops", {
        method: "POST",
        body: JSON.stringify({ branch_id: "branch-1", action: "test_connection" })
      })
    );
    const invalid = await POST(
      new Request("http://localhost/api/pos/settings/inet-nops", {
        method: "POST",
        body: JSON.stringify({ action: "save" })
      })
    );

    expect(success.status).toBe(200);
    expect(testInetNopsProviderConnection).toHaveBeenCalledWith(auth, "branch-1");
    expect(invalid.status).toBe(422);
  });
});
