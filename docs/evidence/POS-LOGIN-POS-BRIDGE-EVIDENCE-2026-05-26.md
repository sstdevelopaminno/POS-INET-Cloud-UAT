> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# POS Login -> POS Bridge Evidence

Date: 2026-05-26  
Environment: Local dev (`localhost:3001` -> `localhost:3000`)  
Tester: Codex (automated + code verification)

## A) Code and Build Baseline

- [x] `pnpm --filter backoffice-web lint` -> pass
- [x] `pnpm --filter backoffice-web typecheck` -> pass
- [x] `pnpm --filter backoffice-web build` -> pass
- [x] `pnpm --filter qr-login-web lint` -> pass
- [x] `pnpm --filter qr-login-web typecheck` -> pass
- [x] `pnpm --filter qr-login-web build` -> pass

## B) Auth Bridge Implementation Evidence

- [x] Added POS-first API auth helper:
  - `apps/backoffice-web/src/lib/pos-api-auth.ts`
- [x] POS API routes switched to POS-bridge auth context (`getPosApiAuthContext`) for `/api/pos/*`.
- [x] POS session fallback support exists in:
  - `apps/backoffice-web/src/lib/auth-context.ts`

## C) Login UI Evidence

- [x] Store step UX updated:
  - `apps/qr-login-web/src/app/login/store/page.tsx`
- [x] Employee step rewritten with readable Thai + error-code mapping:
  - `apps/qr-login-web/src/app/login/employee/page.tsx`
- [x] Device step rewritten with readable Thai + status/error mapping:
  - `apps/qr-login-web/src/app/login/devices/page.tsx`
- [x] Shared pre-entry shell improved:
  - `apps/qr-login-web/src/components/pre-entry/pre-entry-shell.tsx`

## D) E2E Smoke Harness

- [x] Added script:
  - `scripts/login-pos-bridge-smoke.mjs`
- [x] Added npm command:
  - `pnpm qa:login-bridge`
- [ ] Runtime smoke execution with real credentials:
  - Pending env inputs:
    - `POS_SMOKE_STORE_CODE`
    - `POS_SMOKE_EMPLOYEE_CODE`
    - optional `POS_SMOKE_BRANCH_NAME`
    - optional `POS_SMOKE_DEVICE_CODE`

## E) Pending Manual Evidence

- [ ] Screenshots from real run:
  - `login/store`, `login/branches`, `login/employee`, `login/devices`, `preview/pos`
- [ ] API payload snapshots:
  - `/api/pos/session/current`
  - `/api/pos/sales`
- [ ] Multi-tenant isolation run records (tenant A vs tenant B)
- [ ] Multi-branch isolation run records (branch A vs branch B)
