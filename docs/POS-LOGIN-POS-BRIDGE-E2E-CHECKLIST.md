# POS Login -> POS Sales E2E Checklist (Multi-owner / Multi-branch)

Last updated: 2026-05-27  
Scope: `apps/backoffice-web` (`:3000`) unified login -> POS (`/preview/pos`)

## 1) Preconditions

- [ ] Run both apps:
  - [ ] `corepack pnpm --filter backoffice-web dev` (port `3000`)
- [ ] Apply latest DB migrations.
- [ ] Seed demo data with at least:
  - [ ] 2 tenants (different store code)
  - [ ] tenant A with >= 2 active branches
  - [ ] tenant B with 1 active branch
  - [ ] branch devices for each branch
  - [ ] users in roles `owner`, `manager`, `staff`
- [ ] `.env.local` has:
  - [ ] `NEXT_PUBLIC_POS_APP_URL=http://localhost:3000/preview/pos`
  - [ ] `POS_SESSION_HANDOFF_SECRET`

## 2) Happy Path: Multi-branch Tenant

### Case M1: Store -> Branch -> Employee -> Device -> POS

- [ ] Open `http://localhost:3000/login/store`
- [ ] Input valid `store_code` of tenant with many branches
- [ ] Confirm route goes to `/login/branches`
- [ ] Select branch A
- [ ] Confirm route goes to `/login/employee`
- [ ] Verify employee code success
- [ ] Confirm route goes to `/login/devices`
- [ ] Select `ready` device and continue
- [ ] Confirm redirect to `http://localhost:3000/preview/pos`
- [ ] Confirm POS loads with session (no `missing_pos_session` error)

### Case M2: Open/Join Shift after Login

- [ ] On POS page, call session endpoint (or verify via UI):
  - [ ] `/api/pos/session/current` returns `200`
- [ ] Open shift or join shift
- [ ] Confirm sales data loads (`/api/pos/sales`, `/api/pos/products`)
- [ ] Create 1 order and pay successfully

## 3) Happy Path: Single-branch Tenant

### Case S1: Auto Skip Branch

- [ ] Use tenant with exactly 1 active branch
- [ ] Submit valid store code
- [ ] Confirm branch step is skipped (route goes to `/login/employee`)
- [ ] Complete employee + device steps
- [ ] Confirm redirect to POS works

## 4) Isolation and Scope Rules

### Case I1: Tenant Isolation

- [ ] Login with tenant A; capture branch/device/session context
- [ ] Verify APIs in POS return tenant A/branch A data only
- [ ] Logout/re-login as tenant B
- [ ] Verify no data leak from tenant A

### Case I2: Branch Isolation in Same Owner

- [ ] Login branch A and place order
- [ ] Re-login branch B with same owner
- [ ] Confirm branch A order is not in branch B lists

## 5) Role and Permission Rules

### Case R1: Staff

- [ ] Staff can access POS sales
- [ ] Staff cannot perform manager/owner-only actions (approval flows still enforce)

### Case R2: Manager/Owner

- [ ] Manager/Owner can approve restricted actions (stock adjust, cancel bill by policy)
- [ ] Device override (`in_use`) works only with allowed permission

## 6) Negative Cases

### Case N1: Invalid Store Code

- [ ] Submit invalid store code
- [ ] Confirm friendly error shown on store page

### Case N2: Missing Session in POS

- [ ] Open `http://localhost:3000/preview/pos` directly without login
- [ ] Confirm page shows login-required card and link to `:3001/login`

### Case N3: Expired/Invalid Handoff

- [ ] Wait until handoff expires or tamper cookie
- [ ] Confirm POS does not load unauthorized data
- [ ] Confirm user is guided back to login flow

## 7) Regression Quick Pack (Daily)

- [ ] `pnpm --filter backoffice-web lint`
- [ ] `pnpm --filter backoffice-web typecheck`
- [ ] `pnpm --filter backoffice-web lint`
- [ ] `pnpm --filter backoffice-web test`
- [ ] `pnpm --filter backoffice-web build`
- [ ] `pnpm qa:login-bridge` (requires env: `POS_SMOKE_STORE_CODE`, `POS_SMOKE_EMPLOYEE_CODE`)

## 8) Evidence to Attach

- [ ] Screenshots:
  - [ ] login/store
  - [ ] login/branches
  - [ ] login/employee
  - [ ] login/devices
  - [ ] POS landing
- [ ] API snapshots:
  - [ ] `/api/pos/session/current`
  - [ ] `/api/pos/sales`
- [ ] Smoke report:
  - [ ] `docs/qa-screenshots/login-pos-e2e-smoke/results.json`
- [ ] Test date/time:
- [ ] Tester:
- [ ] Environment:
- [ ] Result (`pass`/`fail`):
- [ ] Open defects:
