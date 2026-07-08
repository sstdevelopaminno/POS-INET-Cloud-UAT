# INET Cloud PostgreSQL Cutover

This project can run its database schema on INET Cloud PostgreSQL. For this
UAT clone, INET Cloud PostgreSQL is the intended primary database target. The
Vercel app must not be treated as a POS Preview Supabase client unless an
operator explicitly sets `POS_DATABASE_TARGET=supabase` for a rollback test.

## Target Architecture

```text
GitHub -> Vercel POS frontend/backend -> INET Bridge on INET VM -> INET PostgreSQL
                                                               -> INET UAT Payment API
```

The bridge is the server-side path from Vercel to the INET VM. Do not expose
PostgreSQL directly to the public internet for normal UAT testing.

## Track 1: Create INET Cloud PostgreSQL Schema

Prerequisites on the machine running the command:

- Node.js
- PostgreSQL client `psql`
- `DATABASE_URL` for the INET Cloud PostgreSQL database

Run:

```powershell
cd C:\inet-cloud\POS-INET-Cloud-UAT
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
npm.cmd run inet:db:apply
```

If `psql` is not in PATH:

```powershell
$env:PSQL_BIN="C:\Program Files\PostgreSQL\16\bin\psql.exe"
npm.cmd run inet:db:apply
```

The runner first applies:

```text
infra/inet-cloud-postgres/000_auth_compat.sql
```

Then it applies every file in:

```text
supabase/migrations/*.sql
```

The compatibility SQL creates a minimal `auth.users`, `auth.uid()`, and
`auth.role()` layer so the existing migrations can run on plain PostgreSQL.

## Track 2: Refactor Backend Data Access

Current status in this UAT repo:

- Store code verification can read `tenants` and `branches` from INET
  PostgreSQL through the bridge when `POS_DATABASE_TARGET=inet_cloud` or when
  `INET_PAYMENT_BRIDGE_URL` and `INET_PAYMENT_BRIDGE_API_KEY` are configured.
- Branch list/selection, employee-code verification, and device list reads use
  the same bridge-backed INET data path.
- The bridge DB browser now exposes the UAT login tables needed for read-only
  pre-entry checks: `tenants`, `branches`, `users_profiles`,
  `user_branch_roles`, `pos_user_profiles`, `branch_login_policies`,
  `branch_devices`, `pos_sessions`, and `pos_user_device_scopes`.
- The remaining high-risk cutover is write/session behavior, especially
  `POST /api/auth/devices/select`, POS session validation, audit logging, order
  writes, payment intent writes, and shift/order mutations. These must be moved
  to a bridge-backed PostgreSQL write API before the whole POS flow is
  Supabase-free.

Current backend files call Supabase APIs directly through:

```text
apps/backoffice-web/src/lib/supabase-admin.ts
apps/backoffice-web/src/lib/supabase-server.ts
```

The direct PostgreSQL refactor should introduce a new server-only database
module and migrate route/lib code away from `.from(...)`, `.rpc(...)`, and
`supabase.auth.getUser(...)`.

Highest-impact areas to migrate first:

```text
apps/backoffice-web/src/lib/auth-context.ts
apps/backoffice-web/src/lib/pos-session-guard.ts
apps/backoffice-web/src/lib/feature-gate.ts
apps/backoffice-web/src/lib/table-branch-scope.ts
apps/backoffice-web/src/lib/table-qr-ordering.ts
apps/backoffice-web/src/lib/audit-log.ts
```

## Track 3: Replace Supabase Auth

Plain PostgreSQL does not provide Supabase Auth. The POS app must use its own
session model.

Use existing POS tables as the new auth source:

```text
users_profiles
user_branch_roles
pos_sessions
branch_devices
shifts
```

The backend should validate POS session cookies/tokens against `pos_sessions`
and load tenant/branch/user scope directly from PostgreSQL.

## Current UAT Boundary

For POS-INET-Cloud-UAT, use these rules:

- Primary UAT data source: INET PostgreSQL on the INET VM.
- Vercel access path: INET bridge only, using server-side bridge API key.
- Supabase role: fallback/legacy compatibility only. Supabase remains valid for
  POS Preview and other projects, but it must not be the source of truth for
  this UAT login data.
- Required Vercel intent variable: `POS_DATABASE_TARGET=inet_cloud`.
- Required bridge variables: `DATABASE_URL`, `PSQL_BIN`, `BRIDGE_API_KEY`, and
  the INET payment variables.

Until the write/session cutover is complete, some deeper POS actions may still
hit Supabase-backed modules. Do not fix those by seeding POS Preview Supabase;
move the affected route/lib to the INET bridge-backed PostgreSQL path instead.
