# POS Login Architecture (Next Phase)

## Goals
- Support package-based activation before login.
- One `store_code` per owner/tenant, multiple branches under same code.
- Staff login by `store_code` + `staff_code` (or seller code).
- Optional QR verification as second factor for branch/shift assignment.
- Enforce menu-level permissions by role.
- Work for web app and desktop runtime (online/hybrid/offline modes).

## Proposed Login Flow
1. `Store Access`
- Input: `store_code`
- Validate active package contract and contract status.
- Resolve tenant and available branches.

2. `Branch Selection`
- If tenant has single branch, auto-select branch.
- If multi-branch, show branch list from tenant scope.
- Optional filtering by assigned branch for staff.

3. `Staff Authentication`
- Input: `staff_code` + PIN/password.
- Resolve user profile + branch role.
- Check user active status and branch assignment.

4. `QR Verification` (optional policy per tenant/branch)
- Scan staff QR card (device camera or scanner).
- Verify QR token/session binding.
- Record verification event for audit and shift traceability.

5. `Shift Context`
- Enter with or without open shift (policy-based).
- Attach user to current shift if open.
- If no shift open: allow limited mode or prompt open-shift flow.

6. `Role-based Menu Access`
- Build effective permissions from role + feature flags + package entitlements.
- Render POS modules by permission matrix.

## Core Data Model (Additive)
- `tenant_access_codes`
  - `tenant_id`, `store_code`, `is_active`, `rotated_at`
- `staff_login_codes`
  - `user_id`, `tenant_id`, `branch_id`, `staff_code`, `pin_hash`, `is_active`
- `branch_login_policies`
  - `tenant_id`, `branch_id`, `require_qr_verify`, `allow_no_shift_login`, `allow_cross_branch`
- `staff_qr_identities`
  - `user_id`, `tenant_id`, `qr_token_hash`, `expires_at`, `is_active`
- `login_sessions`
  - `tenant_id`, `branch_id`, `user_id`, `device_id`, `auth_mode`, `verified_by_qr`, `started_at`, `ended_at`

## API Contract (Draft)
- `POST /api/auth/store/resolve`
  - input: `store_code`
  - output: tenant + branches + package status
- `POST /api/auth/staff/login`
  - input: `store_code`, `branch_id`, `staff_code`, `pin`
  - output: auth token + role + permissions
- `POST /api/auth/staff/qr-verify`
  - input: `session_id`, `qr_payload`
  - output: verified status + claims update
- `GET /api/auth/permissions`
  - output: effective menu/actions for current user

## Permission Matrix (Draft)
- `owner`
  - all branch features, sensitive overrides, close shift override
- `manager`
  - sales/void/refund/stock adjust/table move based on policy
- `staff`
  - sales operations only, restricted admin actions

## Desktop Runtime Notes
- Device registration table for trusted terminals.
- Offline token cache with short expiry and signed claims.
- On reconnect, sync login/session events and QR verification logs.

## Rollout Strategy
1. Add schemas and APIs (no UI impact).
2. Add compatibility layer: if no store-code policy, keep current login behavior.
3. Pilot on 1-2 tenants.
4. Gradually enforce store-code + branch selection + QR policy per tenant.

## Vercel and Domain Notes
- Current hosting: Vercel web app.
- Keep auth APIs region-aware and low-latency.
- Final public domain can switch to company-owned domain after full system hardening.
