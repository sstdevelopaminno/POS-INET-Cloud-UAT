# System Stability Audit

Date: 2026-06-04 (Asia/Bangkok)

Scope: repository structure, current docs, recent migrations, login/POS session flow, monitor endpoints, POS stock/catalog updates, and available QA/load evidence.

## Executive Summary

This repo is a production-oriented multi-tenant POS monorepo. The active app is `apps/backoffice-web` using Next.js App Router, Supabase, TypeScript, pnpm workspaces, and shared packages under `packages/*`.

The latest docs are mostly good, but development after `docs/PROJECT-AUDIT-HANDOFF-2026-06-02.md` is not fully captured in one current status document. This file records the current snapshot and the main causes likely related to system-wide slowness/instability.

Primary stability risks found:

1. `/api/admin/pos/monitor` is still the main performance bottleneck under load.
2. Admin monitor UI can poll that heavy endpoint every 5 seconds by default.
3. `/api/pos/session/current` can synthesize an `open` shift during shift lookup timeout when `shift_id` exists, which hides database slowness and can produce misleading session state.
4. Employee-code login has a new `pos_user_profiles` index, but the current lookup path still scans branch users first and only then loads profile codes.
5. Fresh typecheck/test/lint/build could not be run in this shell because Node/npm/pnpm/corepack/git are not in PATH.

## 2026-06-04 UI Stability Update

Implemented after the first audit pass:

| Area | Change | Stability impact |
|---|---|---|
| POS sidebar logout placement | Moved `ล็อคเอาท์` out of the main staff menu and into the sidebar footer directly above language switching. | Keeps destructive/session action separated from normal navigation and matches the requested layout. |
| POS sidebar logout click state | Footer logout button is disabled while logout modal action is busy. | Reduces duplicate logout calls and accidental double clicks. |
| POS settings action buttons | Replaced async `useTransition` wrappers in store/branch/payment settings with explicit busy state. | Prevents save/delete/toggle buttons from becoming clickable again before fetch calls finish. |
| POS settings menu consolidation | Moved `ผู้ใช้งาน` and `จอลูกค้า` access into Settings menu cards. | Reduces sidebar clutter and matches owner settings workflow. |
| POS payment settings | Added branch-scoped payment account schema/API/UI for bank account, account name, account number, PromptPay phone, generated PromptPay payload, QR image URL, and active toggle. | Creates a stable data anchor for bank-transfer/PromptPay flows instead of hardcoded or reserved placeholders. |

Files touched for this update:

- `apps/backoffice-web/src/components/pos-preview/pos-shell-sidebar.tsx`
- `apps/backoffice-web/src/components/pos-preview/pos-staff-menu.tsx`
- `apps/backoffice-web/src/components/pos-preview/pos-settings-workspace.tsx`
- `apps/backoffice-web/src/app/preview/pos/settings/page.tsx`
- `apps/backoffice-web/src/lib/services/pos-settings-service.ts`
- `apps/backoffice-web/src/app/api/pos/settings/*/route.ts`
- `supabase/migrations/202606040001_pos_settings_store_payment.sql`

Verification notes:

- `tsc -p apps/backoffice-web/tsconfig.json --noEmit --pretty false --incremental false` passed when run via the explicit Node path.
- ESLint passed for the files changed in the Settings/sidebar work when run from `apps/backoffice-web`.
- Dev server returned `200 OK` for `/preview/pos/settings`.
- Browser verification without an existing POS session correctly redirected to `/login/store`.
- Automated login verification did not reach Settings because the demo login flow stalled at employee verification in this environment; this needs a separate auth-flow investigation before claiming full visual verification.

## Current Structure

| Path | Role |
|---|---|
| `apps/backoffice-web` | Main Next.js app: Backoffice, IT Admin, POS preview/runtime, login, and API routes. |
| `apps/pos-android` | Android placeholder/docs/API reference area. |
| `packages/shared-types` | Shared TypeScript contracts. |
| `packages/pos-domain` | Business/domain rules. |
| `packages/ui` | Shared UI export surface. |
| `supabase/migrations` | Database schema, RLS, indexes, hardening, and recent POS additions. |
| `scripts` | Smoke, responsive QA, load tests, runtime verification, and seed health checks. |
| `docs` | Architecture, QA evidence, handoff, runbooks, and historical/archived notes. |

## Recent Work Not Fully Centralized In Docs

These changes appear newer than or adjacent to the 2026-06-02 handoff and should be linked from `README.md` or a current docs index:

| Area | Evidence |
|---|---|
| Login/session performance indexes | `supabase/migrations/202606020001_pos_login_performance_indexes.sql` adds partial active-session indexes for device/user lookups. |
| Shift-open idempotency | `supabase/migrations/202606020002_shift_open_idempotency.sql` suspends duplicate open shifts and adds unique open-shift indexes. |
| Product category registry | `supabase/migrations/202606020003_product_category_registry.sql`; API support in `apps/backoffice-web/src/app/api/backoffice/catalog/route.ts`; stock page reads registry in `apps/backoffice-web/src/app/preview/pos/stock/page.tsx`. |
| POS user profile settings | `supabase/migrations/202606030001_pos_user_profile_settings.sql`; API support in `apps/backoffice-web/src/app/api/pos/users/route.ts`; employee-code loading in `apps/backoffice-web/src/lib/server/pre-entry-auth.ts`. |
| Login/POS smoke evidence | `docs/qa-screenshots/login-pos-e2e-smoke/results.json` and `docs/qa-screenshots/login-pos-bridge/results.json` passed on 2026-06-03. |

## Verification Performed

Commands/reads used:

- `rg --files`
- `Get-Content` on root/app configs, key route handlers, migrations, and docs.
- Static search for timeout/retry/performance patterns.
- Review of existing load/QA artifacts under `docs/load-tests` and `docs/qa-screenshots`.

Blocked in this shell:

- `node -v`, `npm run typecheck`, `npm test`, `npm run lint`, `pnpm --version`, `corepack --version`, and `git status -sb` all failed because the commands are not in PATH.
- `node_modules` exists, but without Node/npm/pnpm available, no fresh typecheck/test/lint/build result was produced.

## Findings

### P1: Admin monitor is the clearest system-wide bottleneck

Evidence:

- `docs/load-tests/pos-multi-branch-report.md` shows `/api/admin/pos/monitor` had `21.74%` timeout error rate, `p95=12012ms`, and `p99=12030ms`.
- `apps/backoffice-web/src/app/api/admin/pos/monitor/route.ts:47` uses a cache key that includes `auth.userId`, so cache is not shared across users.
- `apps/backoffice-web/src/app/api/admin/pos/monitor/route.ts:51` uses only `ttlMs: 5000`.
- `apps/backoffice-web/src/app/api/admin/pos/monitor/route.ts:133` fans out by branch with concurrency `4`.
- Each branch runs multiple exact count queries plus audit-log scanning up to `limit(500)` at `apps/backoffice-web/src/app/api/admin/pos/monitor/route.ts:146`.

Likely impact:

- Multiple owners/managers/IT admins opening monitoring pages can amplify database load.
- The endpoint intended to observe incidents can itself contribute to slowness during incident periods.

Recommended fix:

1. Replace per-branch fan-out with a SQL RPC/view that aggregates monitor metrics in one database call.
2. Make cache shareable by tenant/minutes/branch filter when authorization allows it, or cache expensive tenant metrics separately from user authorization.
3. Increase cache TTL for all-branch monitor snapshots to at least 15-30 seconds.
4. Verify indexes with `EXPLAIN`, especially for `audit_logs(tenant_id, branch_id, action, created_at)` and queue status filters.

### P1: Monitor UI polling can overload the heaviest endpoint

Evidence:

- `apps/backoffice-web/src/components/pos/pos-monitor-dashboard.tsx:142` fetches `/api/admin/pos/monitor`.
- `apps/backoffice-web/src/components/pos/pos-monitor-dashboard.tsx:159` starts a polling interval.
- `apps/backoffice-web/src/components/pos/pos-monitor-dashboard.tsx:122` defaults to `5000ms`.
- `.env.example` sets `NEXT_PUBLIC_POS_MONITOR_POLL_MS=30000`, but if env is absent the dashboard falls back to 5 seconds.

Recommended fix:

1. Make the dashboard default match `.env.example`: 30 seconds.
2. Clamp monitor poll interval to a minimum of 15 seconds.
3. Add backoff when `x-admin-pos-monitor-cache=miss` is slow or when a request fails.

### P1: POS session current can hide shift lookup failures

Evidence:

- `apps/backoffice-web/src/app/api/pos/session/current/route.ts:10` defines a query timeout helper.
- `apps/backoffice-web/src/app/api/pos/session/current/route.ts:60` and `:83` use short shift lookup timeouts.
- `apps/backoffice-web/src/app/api/pos/session/current/route.ts:121` enters fallback when `shiftId` exists and lookup timed out.
- `apps/backoffice-web/src/app/api/pos/session/current/route.ts:124` creates a synthetic shift with `status: "open"`.
- `apps/backoffice-web/src/app/api/pos/session/current/route.ts:158` sets `has_active_shift` from that summary.

Risk:

- If the database is slow or unavailable, the API can return `has_active_shift=true` without confirming the shift row.
- This can make the UI look stable while the underlying shift/session data is degraded.

Recommended fix:

1. Do not synthesize an open shift on timeout.
2. Return `shift_lookup_degraded=true` and `has_active_shift=false`, or return a retry-safe 503/504.
3. Log the fallback path as an audit/perf event so it appears in monitoring.

### P1: Employee-code lookup does not yet use the new profile index directly

Evidence:

- `supabase/migrations/202606030001_pos_user_profile_settings.sql:13` adds `idx_pos_user_profiles_code`.
- `apps/backoffice-web/src/lib/server/pre-entry-auth.ts:160` implements `resolveEmployeeByCode`.
- The lookup first reads all `user_branch_roles` for the branch at `apps/backoffice-web/src/lib/server/pre-entry-auth.ts:171`.
- It then calls `loadEmployeeCodes` for all user IDs at `apps/backoffice-web/src/lib/server/pre-entry-auth.ts:186`.

Risk:

- As staff count grows, login latency grows with branch user count.
- Existing load evidence already shows employee verify p95 around 1.8s in `docs/load-tests/pos-login-session-bottleneck-report.json`.

Recommended fix:

1. First query `pos_user_profiles` by `(tenant_id, employee_code)` using the new index.
2. Then verify that user has an active `user_branch_roles` row for the selected branch.
3. Keep derived-code fallback only for legacy/demo users without `pos_user_profiles`.

### P2: Device selection still has several latency/race windows

Evidence:

- `apps/backoffice-web/src/app/api/auth/devices/select/route.ts:104` performs feature/device/employee lookups in parallel.
- `:150` checks active sessions by device id and device code.
- `:190` revokes active sessions by device id and device code.
- `:255` creates login context.
- `:281` creates POS session.
- Best-effort audit/context tasks are intentionally backgrounded from `:291` and `:331`.

Risk:

- This flow is safer than a simple insert, but still multi-step.
- `docs/load-tests/pos-login-session-bottleneck-report.json` shows conflict-mode failures: `device_in_use=7` and `session_not_active=8`. Conflicts are expected in that test mode, but `session_not_active` needs a fresh retest after the June index/idempotency migrations.

Recommended fix:

1. Rerun login bottleneck test in both conflict and override modes after migrations are applied.
2. Consider one RPC for device selection that checks/revokes/creates session atomically.
3. Keep idempotency keys for retries if the client times out after session creation.

### P2: Production rate limiter evidence remains pending

Evidence:

- `apps/backoffice-web/src/lib/server/rate-limit.ts` supports `memory`, `upstash`, and `redis`.
- Existing docs still require production validation for `RATE_LIMIT_BACKEND=upstash|redis`.
- `.env.example` does not list `RATE_LIMIT_BACKEND`, `RATE_LIMIT_REDIS_PREFIX`, or Upstash variables.

Recommended fix:

1. Add production rate-limit variables to `.env.example`.
2. Record fail-closed evidence for auth endpoints in `docs/go-live-evidence-checklist.md`.

### P2: Schema fallback paths improve resilience but can hide migration drift

Many route handlers tolerate missing tables/columns and fall back to legacy behavior. This keeps demos alive, but production should fail visibly when required migrations are missing.

Recommended fix:

1. Add a migration/schema health check to deploy verification.
2. Require latest migrations before enabling production traffic.

### P3: Thai text encoding should be browser-verified

Some shell output showed mojibake for Thai strings, but a second `Select-String` read displayed Thai correctly for `pos-monitor-dashboard.tsx`. Treat this as an environment/output encoding risk until verified in browser screenshots.

## Existing Evidence Snapshot

| Evidence | Result |
|---|---|
| `docs/load-tests/pos-multi-branch-report.md` | `/api/pos/monitor` and `/api/pos/tables` stable; `/api/admin/pos/monitor` p95/p99 timeout. |
| `docs/load-tests/pos-login-session-bottleneck-report.json` | Conflict-mode login had high expected conflicts plus `session_not_active` failures; needs fresh rerun after latest migrations. |
| `docs/qa-screenshots/login-pos-e2e-smoke/results.json` | Passed on 2026-06-03; includes login, branch, employee, device, POS redirect, shift open, products, and expired-session guard. |
| `docs/qa-screenshots/login-pos-bridge/results.json` | Passed on 2026-06-03 through session current. |
| `docs/qa-screenshots/pos-responsive-landscape/results.json` | Passed responsive checks, but some viewports had high load times such as 22.7s on iPad 1180x820. |

## Recommended Next Actions

1. Fix local PATH/toolchain, then run:

```text
corepack pnpm --filter backoffice-web typecheck
corepack pnpm --filter backoffice-web test
corepack pnpm --filter backoffice-web lint
corepack pnpm --filter backoffice-web build
```

2. Reduce admin monitor load:

```text
- Raise default poll interval to 30000ms.
- Add request backoff.
- Move tenant monitor aggregation into SQL/RPC.
- Share expensive cache entries where authorization permits.
```

3. Make `/api/pos/session/current` fail/degrade honestly on shift lookup timeout instead of returning synthetic `open`.

4. Rework employee-code lookup to use `pos_user_profiles(tenant_id, employee_code)` first.

5. Rerun and refresh docs:

```text
corepack pnpm qa:login-bottleneck-load
corepack pnpm qa:login-bridge
node scripts/pos-multi-branch-load-test.mjs
node scripts/pos-responsive-landscape-qa.mjs
```

6. Update `README.md` or create a docs index pointing to this audit and marking archived QR-era docs as historical.
