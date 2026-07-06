# Project Audit & Handoff

Date: 2026-06-02  
Scope: repo structure, `apps/backoffice-web`, shared packages, Supabase migrations, tests, and existing docs.  
Purpose: summarize the current codebase so the next development pass can continue without rediscovering the system.

## Executive Summary

This is a production-oriented multi-tenant POS monorepo for small restaurant/noodle-shop operations. The active web runtime is `apps/backoffice-web`, built with Next.js App Router, TypeScript, Supabase, pnpm workspaces, and Turbo. The repository also contains shared packages for domain rules/types/UI, Supabase migrations/seeds, QA scripts, and a large docs set.

Current active login/POS entry flow is:

`/login/store -> /login/branches | /login/employee -> /login/devices -> /preview/pos`

Older QR-login documents are still present but several are marked archived. Treat archived QR docs as historical audit context only.

## Top-Level Structure

| Path | Role |
|---|---|
| `apps/backoffice-web` | Main Next.js app: Backoffice, POS preview/runtime, IT admin, login, APIs. |
| `apps/pos-android` | Android placeholder/reference area. |
| `packages/shared-types` | Shared TypeScript domain/API contracts. |
| `packages/pos-domain` | Business rules such as approval and shift-close decisions. |
| `packages/ui` | Shared UI package placeholder/export surface. |
| `supabase/migrations` | Database schema and hardening migrations. 39 files found. |
| `supabase/seeds` and `supabase/seed.sql` | Demo/sample seed data. |
| `scripts` | QA, smoke, responsive, load, and reset scripts. |
| `docs` | Architecture/runbook/QA/handoff docs. 57 markdown files found. |

## Stack Snapshot

- Workspace: `pnpm-workspace.yaml` includes `apps/backoffice-web`, `apps/pos-android`, and `packages/*`.
- Root scripts in `package.json` proxy to `backoffice-web`.
- App framework: `next ^16.2.5`, React `19.1.0`, TypeScript `^5.8.3`.
- Database/auth: Supabase (`@supabase/ssr`, `@supabase/supabase-js`).
- Deployment targets/configs present: Vercel (`vercel.json`) and OpenNext Cloudflare (`open-next.config.ts`, `wrangler.toml`).
- Tests: Vitest integration tests under `apps/backoffice-web/tests`; 16 test files found.

## App Router Surface

Observed in `apps/backoffice-web/src/app`:

- 55 `page.tsx` route files.
- 101 `route.ts` API handlers.
- Main route groups:
  - `/login/*` for store, branch, employee, and device pre-entry.
  - `/preview/pos/*` for POS runtime/preview modules.
  - `(backoffice)` for tenant backoffice pages.
  - `(it-admin)` for platform/admin pages.
  - `/api/auth/*`, `/api/pos/*`, `/api/backoffice/*`, `/api/it-admin/*`.

## Core Runtime Flow

### Login and context

Relevant files:

- `apps/backoffice-web/src/lib/server/login-context.ts`
- `apps/backoffice-web/src/lib/server/login-security.ts`
- `apps/backoffice-web/src/lib/server/pos-session.ts`
- `apps/backoffice-web/src/app/api/store/login-context/route.ts`
- `apps/backoffice-web/src/app/api/auth/*`

The code validates an opaque login context, resolves tenant/branch server-side, checks active tenant/branch, applies branch login policy, and validates registered device scope. Successful staff/PIN/card verification creates a POS session and signed handoff cookie.

Important security posture:

- Client-supplied tenant/branch/device scope should not be trusted.
- `POS_SESSION_HANDOFF_SECRET` is required for signed session handoff.
- Login contexts are consumed and replay-protected.

### POS entry gate

Relevant file:

- `apps/backoffice-web/src/components/pos/pos-entry-gate.tsx`

The gate fetches `/api/pos/session/current`, stores the normalized role in `sessionStorage`, and only renders `PosSalesModule` when the current session has an active open shift. If no shift is active, it sends the user to `/preview/pos/shift`.

Note: Thai strings in this file displayed as mojibake in the shell output during this audit. Verify the actual file encoding/text in the IDE before shipping UI copy changes.

### POS session guard

Relevant files:

- `apps/backoffice-web/src/lib/pos-session-guard.ts`
- `apps/backoffice-web/src/app/api/pos/session/current/route.ts`
- `apps/backoffice-web/src/lib/pos-api-auth.ts`

The guard verifies the session cookie or signed handoff token, loads `pos_sessions`, checks status/expiry, checks active user/tenant, computes role permissions, and exposes `requireActiveShift` / `requirePermission`.

The current session endpoint returns session, tenant, branch, user, role, permissions, device, shift summary, and timing headers.

### Sales/order/payment path

Relevant files:

- `apps/backoffice-web/src/components/pos/pos-sales-module.tsx`
- `apps/backoffice-web/src/lib/services/pos-sales-service.ts`
- `apps/backoffice-web/src/app/api/pos/orders/route.ts`
- `apps/backoffice-web/src/app/api/pos/orders/[orderId]/pay/route.ts`
- `apps/backoffice-web/src/app/api/pos/payments/route.ts`

The service prefers direct create path for non-delivery orders by env defaults and can fall back from RPC errors. It supports idempotency, shift validation, server-side product/price validation, stock deduction fallback, audit logging, dead-letter reporting, and payment completion.

### Table management

Relevant files:

- `apps/backoffice-web/src/components/tables/*`
- `apps/backoffice-web/src/lib/services/table-service.ts`
- `apps/backoffice-web/src/app/api/pos/tables/*`
- `apps/backoffice-web/src/app/api/backoffice/tables/*`

`openTableBillSession` prevents disabled/reserved/occupied tables, checks for active sessions, inserts a bill session, updates table status, records perf timing, and appends audit logs. Dine-in orders can attach to active table sessions.

### Stock and inventory

Relevant files/docs:

- `apps/backoffice-web/src/lib/services/stock-transaction-service.ts`
- `apps/backoffice-web/src/lib/ingredient-stock.ts`
- `docs/STOCK-ENGINE-ARCHITECTURE.md`
- `supabase/migrations/202605180001_stock_engine_hardening.sql`

Stock logic is intended to protect against negative stock through database constraints, guarded updates, transaction RPCs, and idempotency. Some runtime paths include direct fallback behavior for schema/RPC drift.

### Printing and receipts

Relevant files/docs:

- `apps/backoffice-web/src/lib/printing/*`
- `docs/PRINTER-ARCHITECTURE.md`
- `docs/BLUETOOTH-BRIDGE-*.md`

Adapters exist for network ESC/POS, Star WebPRNT, local bridge, and Bluetooth bridge.

## Shared Packages

- `@pos/shared-types` defines roles, orders, tables, stock, printer, package, and API response contracts.
- `@pos/pos-domain` contains domain decisions such as approval-required actions, manager/owner approval, and shift-close constraints.
- `@pos/ui` currently exposes shared UI primitives from `packages/ui/src/index.tsx`.

## Existing Documentation To Keep Using

High-signal docs for future work:

- `README.md`
- `docs/POS-UI-SYSTEM.md`
- `docs/POS-SALES-FLOW.md`
- `docs/STOCK-ENGINE-ARCHITECTURE.md`
- `docs/TABLE-MANAGEMENT-FLOOR-PLAN.md`
- `docs/POS-LOGIN-ARCHITECTURE-PHASE-NEXT.md`
- `docs/pos-login-context-handoff.md`
- `docs/production-readiness-checklist.md`
- `docs/go-live-evidence-checklist.md`
- `docs/PRODUCTION-DEPLOYMENT-OPERATIONS-INDEX.md`

Docs marked archived after 2026-05-31 should not be used as active implementation guidance unless explicitly cross-checked against code.

## Verification Attempt

Commands successfully used:

- `rg --files`
- `Get-Content` on root/app config, key services, route handlers, tests, and docs.
- Counts for routes, tests, docs, and migrations.
- Search for `TODO|FIXME|HACK|temporary|placeholder`.

Commands not runnable in this shell session:

- `git status -sb`: `git` not found in PATH.
- `npm run typecheck`, `npm test`: `npm` not found in PATH.
- `pnpm` / `corepack`: not found even through `C:\Windows\System32\cmd.exe`.

Because the Node/package manager toolchain is unavailable in this session, this audit could not produce a fresh pass/fail for typecheck, test, lint, or build. Older docs record pass baselines from 2026-05-26, but those should be re-run before relying on them.

## Findings And Risks

### P1: Fresh verification blocked by missing local toolchain

The current shell cannot find `git`, `npm`, `pnpm`, or `corepack`. Before implementation/release work, fix PATH or use the project machine environment that has Node/pnpm installed, then run:

```text
corepack pnpm --filter backoffice-web typecheck
corepack pnpm --filter backoffice-web test
corepack pnpm --filter backoffice-web lint
corepack pnpm --filter backoffice-web build
```

### P1: Go-live evidence still appears external/manual

Existing docs repeatedly mark operational evidence as pending: manual QA signoff, secret rotation, restore/rollback drill, alert ownership, and rate-limit production verification. Close these before production launch.

### P2: `pos-entry-gate.tsx` Thai UI text needs encoding review

The file displayed garbled Thai text via shell. If the IDE also shows garbled text, replace the affected literals or move them into the existing `i18n.ts` dictionary.

### P2: Some docs are stale/archived but still easy to find

The repo contains many historical docs. Future contributors can accidentally follow archived QR flow notes. Prefer a single current index doc or update `README.md` to point to this handoff and active docs only.

### P2: Direct fallback paths hide schema/RPC drift

Several services intentionally fall back when RPCs/columns are unavailable. This improves runtime resilience but can hide migration drift. For production, add a migration health check to CI/deploy or run `scripts/seed-health-check.mjs` plus schema checks before deploy.

### P3: Large client modules are hard to maintain

`pos-sales-module.tsx` is very large and likely carries multiple responsibilities. Future changes should extract smaller hooks/components around cart state, delivery fields, payment modal state, and API mutation flows only when touching those areas.

## Recommended Next Development Order

1. Restore local toolchain access and rerun typecheck/test/lint/build.
2. Verify `pos-entry-gate.tsx` Thai text encoding and centralize copy in `i18n.ts` if needed.
3. Update `README.md` or docs index to distinguish active docs from archived legacy QR docs.
4. Add a deployment-time schema/migration drift check for critical POS tables/functions.
5. Continue feature work in narrow slices:
   - POS sales UI/state cleanup.
   - Table billing/session behavior.
   - Stock/recipe deduction evidence.
   - Production QA evidence closure.

## Quick File Map For Future Work

| Work area | Start here |
|---|---|
| POS entry/session | `apps/backoffice-web/src/components/pos/pos-entry-gate.tsx`, `src/lib/pos-session-guard.ts` |
| Login flow | `src/app/login/*`, `src/lib/server/login-context.ts`, `src/lib/server/auth-flow.ts` |
| Sales cart/orders | `src/components/pos/pos-sales-module.tsx`, `src/lib/services/pos-sales-service.ts` |
| Tables/floor plan | `src/components/tables/*`, `src/lib/services/table-service.ts` |
| Stock/catalog | `src/components/backoffice/product-management-panel.tsx`, `src/lib/services/stock-transaction-service.ts` |
| Printing | `src/lib/printing/*`, `src/components/backoffice/printers-module.tsx` |
| IT admin | `src/app/(it-admin)/*`, `src/components/it-admin/*`, `src/lib/it-admin-guard.ts` |
| Supabase schema | `supabase/migrations/*`, `supabase/seeds/*` |
| Integration tests | `apps/backoffice-web/tests/integration/*` |

