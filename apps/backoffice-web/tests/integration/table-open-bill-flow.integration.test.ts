import { describe, expect, it, vi } from "vitest";
import { openTableBillSession } from "@/lib/services/table-service";

function createSuccessSupabaseMock(options?: { activeSession?: { id: string; table_id: string; status: "open" | "ordering" | "pending_payment"; order_id: string | null; opened_at: string } | null }) {
  const updateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const activeSession = options?.activeSession ?? null;

  return {
    updateCalls,
    insertCalls,
    from(table: string) {
      return {
        select() {
          const chain = {
            eq() {
              return chain;
            },
            in() {
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return chain;
            },
            maybeSingle: async () => {
              if (table === "dining_tables") {
                return {
                  data: {
                    id: "tb-1",
                    table_code: "A1",
                    table_name: "A1",
                    status: "available",
                    is_active: true
                  },
                  error: null
                };
              }

              if (table === "table_bill_sessions") {
                return { data: activeSession, error: null };
              }

              return { data: null, error: null };
            },
            single: async () => {
              return {
                data: {
                  id: "session-1",
                  table_id: "tb-1",
                  status: "open",
                  order_id: null,
                  opened_at: new Date().toISOString()
                },
                error: null
              };
            }
          };
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          insertCalls.push({ table, payload });
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "session-1",
                    table_id: "tb-1",
                    status: "open",
                    order_id: null,
                    opened_at: new Date().toISOString()
                  },
                  error: null
                })
              };
            }
          };
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push({ table, payload });
          const chain = {
            eq() {
              return chain;
            }
          };
          return chain;
        }
      };
    }
  };
}

describe("openTableBillSession", () => {
  const auth = {
    userId: "u-staff",
    platformRole: "tenant_user" as const,
    tenantId: "t1",
    branchId: "b1",
    branchRole: "staff" as const
  };

  it("opens bill session for available table", async () => {
    const appendAudit = vi.fn(async () => undefined);
    const supabase = createSuccessSupabaseMock();

    const result = await openTableBillSession({
      auth,
      tableId: "tb-1",
      appendAudit,
      supabaseClient: supabase as never
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.table_code).toBe("A1");
      expect(result.data.status).toBe("open");
    }
    expect(supabase.insertCalls).toHaveLength(1);
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(appendAudit.mock.calls[0]?.[0]?.action).toBe("bill_opened_from_table");
  });

  it("returns conflict when table already has active session", async () => {
    const appendAudit = vi.fn(async () => undefined);
    const supabase = createSuccessSupabaseMock({
      activeSession: {
        id: "session-active",
        table_id: "tb-1",
        status: "ordering",
        order_id: "o1",
        opened_at: new Date().toISOString()
      }
    });

    const result = await openTableBillSession({
      auth,
      tableId: "tb-1",
      appendAudit,
      supabaseClient: supabase as never
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("table_already_occupied");
      expect(result.status).toBe(409);
    }
    expect(supabase.insertCalls).toHaveLength(0);
    expect(appendAudit).not.toHaveBeenCalled();
  });
});
