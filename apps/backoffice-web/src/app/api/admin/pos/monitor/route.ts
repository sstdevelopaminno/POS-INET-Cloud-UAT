import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { mapWithConcurrency } from "@/lib/async-batch";
import { POS_GUARDS } from "@/lib/pos-resilience";
import { readThroughRuntimeCache } from "@/lib/route-runtime-cache";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("undefined column") || normalized.includes("pgrst");
}

function parseStatusCode(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  if (normalized < 100 || normalized > 599) return null;
  return normalized;
}

function parseRoute(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const route = value.trim();
  if (!route.startsWith("/")) return "unknown";
  return route.slice(0, 160);
}

function parseMinutes(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("minutes") ?? POS_GUARDS.deadLetterWindowMinutes);
  if (!Number.isFinite(raw)) return POS_GUARDS.deadLetterWindowMinutes;
  return Math.max(5, Math.min(1440, Math.trunc(raw)));
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  try {
    const auth = await getAuthContext({ requireBranchScope: false });
    if (!auth.tenantId) {
      const response = fail("missing_tenant_scope", "Tenant scope is required.", 401);
      response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
      return response;
    }

    const { searchParams } = new URL(req.url);
    const minutes = parseMinutes(searchParams);
    const requestedBranchId = String(searchParams.get("branch_id") ?? "").trim() || null;
    const cacheKey = `admin-pos-monitor:${auth.tenantId}:${auth.userId}:${minutes}:${requestedBranchId ?? "all"}`;

    const { value: payload, source: cacheSource } = await readThroughRuntimeCache({
      key: cacheKey,
      ttlMs: 5000,
      loader: async () => {
        const supabase = getSupabaseServiceClient();
        const staleSinceIso = new Date(Date.now() - POS_GUARDS.staleQueuedMinutes * 60_000).toISOString();
        const windowSinceIso = new Date(Date.now() - minutes * 60_000).toISOString();

        let allowedBranchIds: string[] = [];
        if (auth.platformRole === "it_admin") {
          const { data: allBranches, error: branchesError } = await supabase
            .from("branches")
            .select("id")
            .eq("tenant_id", auth.tenantId);
          if (branchesError) {
            throw new Error(`branches_query_failed:${branchesError.message}`);
          }
          allowedBranchIds = [...new Set((allBranches ?? []).map((row) => String(row.id)).filter(Boolean))];
        } else {
          const { data: branchRoles, error: branchRolesError } = await supabase
            .from("user_branch_roles")
            .select("branch_id")
            .eq("tenant_id", auth.tenantId)
            .eq("user_id", auth.userId);
          if (branchRolesError) {
            throw new Error(`branch_roles_query_failed:${branchRolesError.message}`);
          }
          allowedBranchIds = [...new Set((branchRoles ?? []).map((row) => String(row.branch_id)).filter(Boolean))];
        }

        if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
          throw new Error("forbidden_branch_scope");
        }

        const targetBranchIds = requestedBranchId ? [requestedBranchId] : allowedBranchIds;

        if (targetBranchIds.length === 0) {
          return {
            tenant_id: auth.tenantId,
            generated_at: new Date().toISOString(),
            filters: {
              minutes,
              branch_id: requestedBranchId
            },
            limits: {
              order_queue_limit: POS_GUARDS.orderQueueHardLimit,
              print_queue_limit: POS_GUARDS.printQueueHardLimit
            },
            totals: {
              branches: 0,
              queued_orders: 0,
              dead_letters_recent: 0,
              order_dead_letters_recent: 0,
              payment_dead_letters_recent: 0,
              critical: 0,
              warn: 0,
              api_errors_recent_total: 0,
              api_errors_4xx_recent: 0,
              api_errors_409_recent: 0,
              api_errors_5xx_recent: 0
            },
            items: []
          };
        }

        const { data: branchRows, error: branchRowsError } = await supabase
          .from("branches")
          .select("id,name")
          .eq("tenant_id", auth.tenantId)
          .in("id", targetBranchIds);
        if (branchRowsError) {
          throw new Error(`branches_query_failed:${branchRowsError.message}`);
        }
        const branchNameMap = new Map((branchRows ?? []).map((row) => [String(row.id), String(row.name ?? row.id)]));

        const safeCount = async (query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> => {
          const result = await query;
          if (result.error) {
            if (isSchemaMissingError(result.error.message)) return 0;
            throw new Error(result.error.message);
          }
          return result.count ?? 0;
        };

        const items = await mapWithConcurrency({
          items: targetBranchIds,
          concurrency: 4,
          worker: async (branchId) => {
            const safePerfErrorSummary = async () => {
              const { data, error } = await supabase
                .from("audit_logs")
                .select("metadata")
                .eq("tenant_id", auth.tenantId!)
                .eq("branch_id", branchId)
                .eq("action", "pos_route_perf")
                .gt("created_at", windowSinceIso)
                .order("created_at", { ascending: false })
                .limit(500);
              if (error) {
                if (isSchemaMissingError(error.message)) {
                  return {
                    total: 0,
                    c4xx: 0,
                    c409: 0,
                    c5xx: 0,
                    topRoutes: [] as Array<{ route: string; count: number }>
                  };
                }
                throw new Error(error.message);
              }

              let total = 0;
              let c4xx = 0;
              let c409 = 0;
              let c5xx = 0;
              const routeMap = new Map<string, number>();
              for (const row of data ?? []) {
                const metadata = (row as { metadata?: Record<string, unknown> | null }).metadata ?? {};
                const statusCode = parseStatusCode(metadata.status_code);
                if (!statusCode || statusCode < 400) continue;
                total += 1;
                if (statusCode >= 500) c5xx += 1;
                else c4xx += 1;
                if (statusCode === 409) c409 += 1;
                const route = parseRoute(metadata.route);
                routeMap.set(route, (routeMap.get(route) ?? 0) + 1);
              }
              const topRoutes = Array.from(routeMap.entries())
                .map(([route, count]) => ({ route, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3);
              return { total, c4xx, c409, c5xx, topRoutes };
            };

            const [
              queuedOrders,
              staleQueuedOrders,
              printQueueDepth,
              printFailedRecent,
              deadLettersRecent,
              orderDeadLettersRecent,
              paymentDeadLettersRecent,
              perfErrorSummary
            ] = await Promise.all([
              safeCount(
                supabase
                  .from("orders")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .eq("status", "queued")
              ),
              safeCount(
                supabase
                  .from("orders")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .eq("status", "queued")
                  .lt("created_at", staleSinceIso)
              ),
              safeCount(
                supabase
                  .from("print_jobs")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .in("status", ["pending", "printing", "retrying"])
              ),
              safeCount(
                supabase
                  .from("print_jobs")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .eq("status", "failed")
                  .gt("created_at", windowSinceIso)
              ),
              safeCount(
                supabase
                  .from("audit_logs")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .in("action", ["pos_order_dead_letter", "pos_payment_dead_letter", "pos_print_dead_letter"])
                  .gt("created_at", windowSinceIso)
              ),
              safeCount(
                supabase
                  .from("audit_logs")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .eq("action", "pos_order_dead_letter")
                  .gt("created_at", windowSinceIso)
              ),
              safeCount(
                supabase
                  .from("audit_logs")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", auth.tenantId!)
                  .eq("branch_id", branchId)
                  .eq("action", "pos_payment_dead_letter")
                  .gt("created_at", windowSinceIso)
              ),
              safePerfErrorSummary()
            ]);

            let level: "ok" | "warn" | "critical" = "ok";
            if (queuedOrders >= POS_GUARDS.orderQueueHardLimit || printQueueDepth >= POS_GUARDS.printQueueHardLimit) {
              level = "critical";
            } else if (perfErrorSummary.c5xx >= 3) {
              level = "critical";
            } else if (staleQueuedOrders > 0 || deadLettersRecent > 0 || printFailedRecent > 0 || perfErrorSummary.total > 0) {
              level = "warn";
            }

            return {
              branch_id: branchId,
              branch_name: branchNameMap.get(branchId) ?? branchId,
              level,
              queued_orders: queuedOrders,
              queued_orders_stale: staleQueuedOrders,
              print_queue_depth: printQueueDepth,
              print_failed_recent: printFailedRecent,
              dead_letters_recent: deadLettersRecent,
              order_dead_letters_recent: orderDeadLettersRecent,
              payment_dead_letters_recent: paymentDeadLettersRecent,
              api_errors_recent_total: perfErrorSummary.total,
              api_errors_4xx_recent: perfErrorSummary.c4xx,
              api_errors_409_recent: perfErrorSummary.c409,
              api_errors_5xx_recent: perfErrorSummary.c5xx,
              api_error_routes_top: perfErrorSummary.topRoutes
            };
          }
        });

        const totals = items.reduce(
          (acc, row) => {
            acc.queued_orders += row.queued_orders;
            acc.dead_letters_recent += row.dead_letters_recent + row.print_failed_recent;
            acc.order_dead_letters_recent += row.order_dead_letters_recent;
            acc.payment_dead_letters_recent += row.payment_dead_letters_recent;
            acc.api_errors_recent_total += row.api_errors_recent_total;
            acc.api_errors_4xx_recent += row.api_errors_4xx_recent;
            acc.api_errors_409_recent += row.api_errors_409_recent;
            acc.api_errors_5xx_recent += row.api_errors_5xx_recent;
            if (row.level === "critical") acc.critical += 1;
            if (row.level === "warn") acc.warn += 1;
            return acc;
          },
          {
            branches: items.length,
            queued_orders: 0,
            dead_letters_recent: 0,
            order_dead_letters_recent: 0,
            payment_dead_letters_recent: 0,
            critical: 0,
            warn: 0,
            api_errors_recent_total: 0,
            api_errors_4xx_recent: 0,
            api_errors_409_recent: 0,
            api_errors_5xx_recent: 0
          }
        );

        return {
          tenant_id: auth.tenantId,
          generated_at: new Date().toISOString(),
          filters: {
            minutes,
            branch_id: requestedBranchId
          },
          limits: {
            order_queue_limit: POS_GUARDS.orderQueueHardLimit,
            print_queue_limit: POS_GUARDS.printQueueHardLimit
          },
          totals,
          items
        };
      }
    });

    const response = ok(payload);
    response.headers.set("x-admin-pos-monitor-cache", cacheSource);
    response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "forbidden_branch_scope") {
      const response = fail("forbidden_branch_scope", "You cannot access this branch scope.", 403);
      response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
      return response;
    }
    if (message.startsWith("branch_roles_query_failed:")) {
      const response = fail("branch_roles_query_failed", message.slice("branch_roles_query_failed:".length), 500);
      response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
      return response;
    }
    if (message.startsWith("branches_query_failed:")) {
      const response = fail("branches_query_failed", message.slice("branches_query_failed:".length), 500);
      response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
      return response;
    }
    const response = fail("admin_pos_monitor_failed", message, 500);
    response.headers.set("x-admin-pos-monitor-ms", String(Date.now() - startedAt));
    return response;
  }
}
