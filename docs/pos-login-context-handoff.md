> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# POS Secure Login Context Handoff Notes

## What Was Implemented
### 1) Secure temporary login context
- Added `pos_login_contexts` table (short-lived context token):
  - `tenant_id`, `branch_id`, `store_code`, optional `device_code`
  - `status`, `expires_at`, `consumed_at`
  - indexes + update trigger + RLS

### 2) Branch policy expansion
- Added policy flags:
  - `allow_pin_login`
  - `allow_staff_card_login`

### 3) Store->branch->scan hardening
- Step 1-2 page now creates secure context on server.
- Redirect now uses opaque context ID:
  - `/scan?ctx=<login_context_id>`
- Removed dependency on raw tenant/branch query params in scan.

### 4) Scan page server validation
- `/scan` now validates context server-side:
  - context exists and active
  - not expired
  - tenant active and matching store code
  - branch active and belonging to tenant
  - branch policy exists
- device validation against `branch_devices`:
  - missing device when `require_registered_device=true`
  - unregistered device
  - tenant mismatch
  - branch mismatch
  - inactive/not-allowed status
  - policy blocked (shared/unlocked device not allowed)
- updates `branch_devices.last_seen_at` when device is valid
- renders explicit error states for each failure case.

### 5) Real auth verify endpoints
- Added:
  - `POST /api/auth/qr/verify`
  - `POST /api/auth/pin/verify`
  - `POST /api/auth/staff-card/verify`
- All endpoints:
  - accept `ctx` (plus method payload) from client
  - re-validate context + tenant + branch + policy + device on server
  - resolve and validate user + `user_branch_roles`
  - create `pos_sessions`
  - consume `pos_login_contexts`
  - write `login_attempts` and `audit_logs`

### 6) Replay protection
- `consumeLoginContext(...)` updates context with strict active+not-expired guard.
- Reuse of consumed context returns:
  - `context_consumed` or
  - `context_replay_detected`

### 7) Session handoff design
- Chosen approach: HttpOnly handoff cookie (preferred same parent domain flow).
- Cookie payload is short-lived signed token (HMAC) that carries non-public session linkage:
  - `sid`, `tid`, `bid`, `uid`, `role`, `iat`, `exp`
- No sensitive session data in query string.
- POS app should exchange/validate this token server-side immediately (next phase integration).

### 8) Production-hardened auth artifacts
- `pos_qr_login_tokens`:
  - short-lived token lifecycle: `active|used|expired|revoked`
  - one-time use enforcement with replay rejection
  - hashed secret storage (`token_hash`), plaintext token cleared
- `pos_staff_cards`:
  - card lifecycle: `active|inactive|lost|revoked`
  - hashed secret storage (`card_hash`), plaintext card code cleared
  - strict tenant+branch scope checks

### 9) New persistence
- `pos_sessions`: authenticated POS login sessions.
- `login_attempts`: success/failure login tracking with failure reasons.
- `audit_logs`: reused and extended with POS login fields.

## Shift Check-in Gate (Phase 2)
### 1) POS session handshake into POS app
- POS app now reads secure session via:
  - `GET /api/pos/session/current`
- Session comes from HttpOnly cookie (`pos_session_handoff`) and is persisted server-side as `pos_session_id` cookie after validation.

### 2) Shift APIs (session-bound)
- `GET /api/pos/shifts/current`
  - returns active/open shifts for current session scope only.
- `POST /api/pos/shifts/open`
  - opens shift for current tenant+branch(+device scope) and binds `pos_sessions.shift_id`.
- `POST /api/pos/shifts/join`
  - binds current session to an existing open shift in same tenant+branch scope.
- `POST /api/pos/shifts/close`
  - closes current active shift (permission-gated) and clears `pos_sessions.shift_id`.
- Existing `branch_device_shift_sessions` table is retained for compatibility; `shifts` is the enforced sales gate model.

### 3) Shift gate UI
- POS entry page blocks sales UI until:
  - valid `pos_session` exists
  - `shift_id` points to open shift
- If missing session: show login required + link to ID app.
- If missing shift: show open/join shift actions.

### 4) Guard utility for future POS APIs
- Added server guard helper:
  - `requirePosSession`
  - `requireActiveShift`
  - `requirePermission`
  - `getTenantBranchScopeFromSession`
- Upcoming POS Sales MVP routes should use these guards by default.

## Backoffice/Admin Operations (Phase 5)
### Platform Routes
- Added operational routes for IT admin:
  - `/tenants`
  - `/tenants/[tenantId]/branches`
  - `/tenants/[tenantId]/users`
  - `/tenants/[tenantId]/devices`
  - `/tenants/[tenantId]/login-policies`
  - `/tenants/[tenantId]/sessions`
  - `/tenants/[tenantId]/shifts`
  - `/tenants/[tenantId]/features`
  - `/audit-logs`

### Admin API Security
- Added server-only IT-admin APIs under `api/it-admin/admin/*`.
- Guard rule:
  - require authenticated context
  - require `platformRole=it_admin`
  - enforce tenant/branch scoped filters in every query.
- No service-role key usage in client components.

### Admin Workflow Coverage
- Device control: approve, activate/deactivate, block, lock-mode visibility, last-seen tracking.
- Login policies: update QR/PIN/staff-card/registered-device/multi-device/max-device constraints.
- Branch role management: assign role, change role, deactivate role, duplicate assignment protection.
- Session/shift control: list active sessions, revoke session, close/suspend shifts.
- Feature subscriptions: list and enable/disable tenant or branch override.
- Audit traces: all admin mutations append audit log entries.

## Files Changed
- DB migration:
  - `supabase/migrations/202605250003_secure_login_context.sql`
  - `supabase/migrations/202605250004_branch_policy_registered_device.sql`
  - `supabase/migrations/202605250005_pos_auth_sessions.sql`
  - `supabase/migrations/202605260001_auth_token_staff_card_hardening.sql`
  - `supabase/migrations/202605260003_activation_enrollment_mobile_qr.sql`
- API routes:
  - `apps/qr-login-web/src/app/api/store/resolve/route.ts`
  - `apps/qr-login-web/src/app/api/store/login-context/route.ts`
  - `apps/qr-login-web/src/app/api/auth/qr/verify/route.ts`
  - `apps/qr-login-web/src/app/api/auth/pin/verify/route.ts`
  - `apps/qr-login-web/src/app/api/auth/staff-card/verify/route.ts`
  - `apps/backoffice-web/src/app/api/pos/session/current/route.ts`
  - `apps/backoffice-web/src/app/api/pos/shifts/current/route.ts`
  - `apps/backoffice-web/src/app/api/pos/shifts/open/route.ts`
  - `apps/backoffice-web/src/app/api/pos/shifts/join/route.ts`
  - `apps/backoffice-web/src/app/api/pos/shifts/close/route.ts`
  - `apps/backoffice-web/src/app/api/it-admin/admin/activation-tokens/route.ts`
  - `apps/backoffice-web/src/app/api/it-admin/admin/device-enrollments/route.ts`
  - `apps/backoffice-web/src/app/api/it-admin/admin/device-enrollments/[id]/approve/route.ts`
  - `apps/backoffice-web/src/app/api/it-admin/admin/device-enrollments/[id]/revoke/route.ts`
  - `apps/qr-login-web/src/app/api/mobile/activation/claim/route.ts`
  - `apps/qr-login-web/src/app/api/mobile/login/start/route.ts`
  - `apps/qr-login-web/src/app/api/mobile/login/verify/route.ts`
- QR login UI/pages:
  - `apps/qr-login-web/src/app/page.tsx`
  - `apps/qr-login-web/src/app/scan/page.tsx`
  - `apps/qr-login-web/src/app/scan/scan-login-methods.tsx`
- Server helpers:
  - `apps/qr-login-web/src/lib/server/login-security.ts`
  - `apps/qr-login-web/src/lib/server/login-context.ts`
  - `apps/qr-login-web/src/lib/server/auth-verification.ts`
  - `apps/qr-login-web/src/lib/server/pos-session.ts`
  - `apps/qr-login-web/src/lib/server/audit-log.ts`
  - `apps/qr-login-web/src/lib/server/auth-flow.ts`
  - `apps/qr-login-web/src/lib/server/rate-limit.ts`
  - `apps/qr-login-web/src/lib/server/activation-token.ts`
  - `apps/qr-login-web/src/lib/server/device-enrollment.ts`
  - `apps/qr-login-web/src/lib/server/mobile-login.ts`
  - `apps/backoffice-web/src/lib/pos-session-guard.ts`
  - `apps/backoffice-web/src/lib/activation-admin-guard.ts`
- Env and server helpers:
  - `apps/qr-login-web/.env.example`
  - `apps/qr-login-web/src/lib/env.ts`
  - `apps/qr-login-web/src/lib/supabase-admin.ts`
  - `apps/backoffice-web/.env.example`
- Architecture doc:
  - `docs/pos-multi-owner-branch-architecture.md`

## Security Considerations
- Client no longer sends trusted tenant/branch identity to scan via URL.
- Service role key is server-only (not shipped to client bundle).
- Context token is opaque, short-lived, and revalidated on the server.
- Scope checks ensure tenant/branch relationship integrity.
- Expired contexts are rejected and marked expired.
- Device identity is resolved from secure cookie (`POS_DEVICE_CODE_COOKIE_NAME`) when available.
- Client-provided device code is not trusted as authoritative identity.

## Final Hardening (Prompt 8)
### 1) Rate limiting coverage
- Protected public and security-sensitive endpoints:
  - `POST /api/store/resolve`
  - `POST /api/store/login-context`
  - `POST /api/auth/qr/verify`
  - `POST /api/auth/pin/verify`
  - `POST /api/auth/staff-card/verify`
- Limits are keyed by IP and, where available, by `device_code`.
- Excessive attempts return `429 rate_limited` with `Retry-After`.
- Current implementation supports:
  - `RATE_LIMIT_BACKEND=memory` for local/dev fallback.
  - `RATE_LIMIT_BACKEND=upstash|redis` for centralized multi-instance enforcement.
- Auth verify endpoints (`qr_verify|pin_verify|staff_card_verify`) fail closed in production when backend is unavailable.

### 2) Safe error handling
- Public responses now avoid returning raw database/internal exception messages.
- Internal details are logged server-side for diagnostics.

### 2.1) POS preview resilience update
- Added audit schema compatibility migration for legacy/local DBs:
  - `supabase/migrations/202605260002_fix_audit_logs_target_user_id.sql`
- `POST /api/pos/perf` is now fail-soft:
  - audit insert failures are logged server-side
  - response is non-blocking (`logged:false`) instead of `500`
- `/preview/pos` session gate now uses timeout + retry UI to avoid infinite `Loading POS session...` states.

### 3) Additional audit coverage
- Login replay attempts and context consume failures are explicitly audited.
- Device mismatch and method-not-allowed paths are audited in login flow.
- Context consumed success is audited alongside login success/session creation.

## Mobile QR Phase 1: Activation + Enrollment + Login Foundation
### Activation and enrollment requirement
- Mobile login cannot proceed from client-sent `device_code` alone.
- Device trust is granted only after server-side activation token claim + enrollment validation.

### New schema foundation
- `activation_tokens`:
  - hash-only secret storage (`token_hash`)
  - one-time/short-lived lifecycle: `active|consumed|expired|revoked`
- `device_enrollments`:
  - enrollment lifecycle: `pending|active|revoked|blocked`
  - trust lifecycle: `untrusted|enrolled|trusted`
- `mobile_device_sessions`:
  - mobile-authenticated session lifecycle: `active|expired|revoked`
- `branch_login_policies` extended with:
  - `allow_mobile_qr_login`
  - `require_mobile_device_enrollment`
  - `allow_mobile_slip_scan` (reserved, not implemented in this phase)

### New APIs
- Backoffice/admin:
  - `POST /api/it-admin/admin/activation-tokens`
  - `GET /api/it-admin/admin/device-enrollments`
  - `POST /api/it-admin/admin/device-enrollments/[id]/approve`
  - `POST /api/it-admin/admin/device-enrollments/[id]/revoke`
- Mobile foundation in qr-login-web:
  - `POST /api/mobile/activation/claim`
  - `POST /api/mobile/login/start`
  - `POST /api/mobile/login/verify`

### Mobile login foundation behavior
1. Claim:
   - verify activation token hash/status/expiry/scope
   - create/update device enrollment
   - consume token (one-time)
2. Start:
   - requires enrolled/trusted mobile device
   - resolves tenant/branch from store code + server-side validation
   - returns opaque `ctx` only
3. Verify:
   - validates ctx + enrollment + tenant + branch + policy + user role
   - creates `mobile_device_sessions`
   - consumes `ctx` and blocks replay
   - writes `login_attempts` and `audit_logs`

### Separation from slip scan
- Mobile slip scan is intentionally excluded from this phase.
- It must use separate APIs/permissions/audit actions and must not reuse login token verification directly.

## Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_POS_APP_URL`
- `POS_LOGIN_CONTEXT_TTL_MINUTES` (optional, default 10)
- `POS_DEVICE_CODE_COOKIE_NAME` (optional, default `pos_device_code`)
- `POS_SESSION_TTL_HOURS` (optional, default 12)
- `POS_SESSION_HANDOFF_SECRET` (required for signed handoff token)
- `POS_SESSION_HANDOFF_TTL_SECONDS` (optional, default 120)
- `POS_SESSION_COOKIE_NAME` (optional, default `pos_session_handoff`)
- `POS_SESSION_COOKIE_DOMAIN` (optional)
- `POS_SESSION_COOKIE_SECURE` (optional override)
- `POS_PUBLIC_RATE_LIMIT_WINDOW_SECONDS` (optional, default 60)
- `POS_STORE_RESOLVE_RATE_LIMIT_MAX` (optional, default 30)
- `POS_STORE_LOGIN_CONTEXT_RATE_LIMIT_MAX` (optional, default 20)
- `POS_LOGIN_RATE_LIMIT_IP_MAX` (optional, default 25)
- `POS_LOGIN_RATE_LIMIT_DEVICE_MAX` (optional, default 40)
- `RATE_LIMIT_BACKEND` (`memory|upstash|redis`)
- `RATE_LIMIT_REDIS_PREFIX` (optional, default `pos:rate-limit`)
- `UPSTASH_REDIS_REST_URL` (required when backend is `upstash|redis`)
- `UPSTASH_REDIS_REST_TOKEN` (required when backend is `upstash|redis`)
- `ACTIVATION_TOKEN_TTL_MINUTES`
- `MOBILE_DEVICE_CODE_COOKIE_NAME`
- `MOBILE_ENROLLMENT_COOKIE_NAME`
- `MOBILE_ENROLLMENT_SECRET`
- `MOBILE_ENROLLMENT_REF_TTL_SECONDS`
- `MOBILE_LOGIN_CONTEXT_TTL_MINUTES`
- `MOBILE_DEVICE_SESSION_TTL_HOURS`
- `MOBILE_COOKIE_SECURE`
- `MOBILE_COOKIE_DOMAIN` (optional)
- `MOBILE_ACTIVATION_CLAIM_RATE_LIMIT_MAX`
- `MOBILE_ACTIVATION_CLAIM_RATE_LIMIT_WINDOW_SECONDS`
- `MOBILE_LOGIN_START_RATE_LIMIT_MAX`
- `MOBILE_LOGIN_START_RATE_LIMIT_WINDOW_SECONDS`
- `MOBILE_LOGIN_VERIFY_RATE_LIMIT_IP_MAX`
- `MOBILE_LOGIN_VERIFY_RATE_LIMIT_DEVICE_MAX`
- `MOBILE_LOGIN_VERIFY_RATE_LIMIT_WINDOW_SECONDS`

## Next Recommended Step (Priority)
1. Configure production rate-limit backend (`RATE_LIMIT_BACKEND=upstash|redis`) and verify fail-closed auth behavior.
2. Complete operational evidence signoff in `docs/go-live-evidence-checklist.md`.
3. For local preview issues, re-apply migrations and verify:
   - `/api/pos/session/current`
   - `/api/pos/shifts/current`

## Pre-entry Login Flow Refresh (2026-05-26)
### Scope
- Updated only login and pre-entry orchestration.
- Existing POS Sales UI/screen is intentionally unchanged.

### New login route flow
1. `/login/store`
2. `/login/branches` (skipped when single-branch auto-skip is enabled)
3. `/login/employee`
4. `/login/devices`
5. redirect to existing POS route (`NEXT_PUBLIC_POS_APP_URL`)

### Mobile QR web routes
- `/login/qr-card`
- `/login/qr-scan`
- `/login/qr-success`

### New APIs
- `POST /api/auth/store-code/verify`
- `GET /api/auth/branches`
- `POST /api/auth/branches/select`
- `POST /api/auth/employee/verify-code`
- `POST /api/auth/employee/verify-qr`
- `GET /api/auth/devices`
- `POST /api/auth/devices/select`
- `POST /api/auth/qr/create`
- `GET /api/auth/session/context`
- `DELETE /api/auth/session/context`

### Security invariants preserved
- Client cannot directly control trusted tenant/branch/device scope.
- Server derives scope from signed opaque pre-entry context cookie.
- Device/employee checks remain tenant+branch scoped server-side.
- POS session and handoff cookies are still server-issued only.
- Feature gate checks remain server-side.
- Sensitive events are audited:
  - store code login attempt
  - branch selected
  - employee verification success/failure
  - qr scan success/failure
  - permission denied
  - device selected
  - session created
