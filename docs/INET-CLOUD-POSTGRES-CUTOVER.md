# INET Cloud PostgreSQL Cutover

This project can run its database schema on INET Cloud PostgreSQL, but the
current Vercel backend still uses Supabase client APIs. The database move and
the application refactor are separate tracks.

## Target Architecture

```text
GitHub -> Vercel POS frontend/backend -> INET Cloud PostgreSQL
                                      -> INET Payment Bridge -> INET UAT API
```

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

Until Track 2 and Track 3 are complete, Vercel still needs Supabase-compatible
environment variables. The INET database schema can be prepared now, but the
application will not be fully Supabase-free until the backend data/auth layer is
refactored.
