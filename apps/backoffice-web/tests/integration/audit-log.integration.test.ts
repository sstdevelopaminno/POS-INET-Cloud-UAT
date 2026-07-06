import { describe, expect, it, vi } from "vitest";
import { appendAuditLog } from "@/lib/audit-log";

describe("appendAuditLog", () => {
  it("maps and writes audit log rows with required hardening fields", async () => {
    const writeRow = vi.fn(async () => undefined);

    const result = await appendAuditLog(
      {
        tenantId: "00000000-0000-0000-0000-000000000001",
        branchId: "00000000-0000-0000-0000-000000000011",
        actorUserId: "00000000-0000-0000-0000-000000000102",
        actorRole: "manager",
        action: "pin_approval_granted",
        targetTable: "orders",
        targetId: "00000000-0000-0000-0000-000000001001",
        metadata: {
          reason: "manager override",
          before_data: { status: "queued" },
          after_data: { status: "cancelled" }
        },
        overrideByUserId: "00000000-0000-0000-0000-000000000101",
        ipAddress: "10.0.0.1",
        userAgent: "vitest-agent"
      },
      { writeRow }
    );

    expect(result.inserted).toBe(true);
    expect(writeRow).toHaveBeenCalledTimes(1);

    const row = writeRow.mock.calls[0]?.[0];
    expect(row).toMatchObject({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      branch_id: "00000000-0000-0000-0000-000000000011",
      actor_user_id: "00000000-0000-0000-0000-000000000102",
      actor_role: "manager",
      user_id: "00000000-0000-0000-0000-000000000102",
      role: "manager",
      action: "pin_approval_granted",
      module: "pos_sales",
      entity_type: "orders",
      entity_id: "00000000-0000-0000-0000-000000001001",
      override_by_user_id: "00000000-0000-0000-0000-000000000101",
      ip_address: "10.0.0.1",
      user_agent: "vitest-agent"
    });
    expect(row.before_data).toEqual({ status: "queued" });
    expect(row.after_data).toEqual({ status: "cancelled" });
  });

  it("does not throw when audit log persistence fails", async () => {
    const writeRow = vi.fn(async () => {
      throw new Error("insert failed");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await appendAuditLog(
      {
        actorUserId: "00000000-0000-0000-0000-000000000102",
        actorRole: "manager",
        action: "shift_closed",
        targetTable: "shifts",
        targetId: "00000000-0000-0000-0000-000000008001"
      },
      { writeRow }
    );

    expect(result.inserted).toBe(false);
    expect(result.error).toBe("audit_log_write_failed");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
