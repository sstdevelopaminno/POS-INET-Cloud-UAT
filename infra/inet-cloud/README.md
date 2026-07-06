# INET Cloud Completion Pack

This folder is the operational handoff for finishing `POS-INET-Cloud-UAT` on INET Cloud.

Current production is intentionally fail-closed until the INET-hosted database/API is ready. Do not point this UAT project back to the POS Preview Supabase project.

## Target

```text
GitHub main
  -> Vercel project pos-inet-cloud-uat
      -> INET Cloud database/API
      -> INET Payment Bridge on INET VM
          -> INET Payment UAT
```

## What Must Exist Before The POS Can Be Fully Tested

- INET VM reachable on the chosen public ports.
- Supabase-compatible API on INET Cloud, or a completed app refactor for plain PostgreSQL.
- HTTPS URL for the database/API.
- Public anon/publishable key for browser-safe Supabase client calls.
- Secret service-role key for server-only calls.
- Bridge HTTPS URL and bridge API key.
- SQL migrations applied to the INET database.
- Isolated UAT seed data, not POS Preview live data.

## Files

- `inet-production.env.example` - local-only template for values that will be pushed to Vercel.
- `check-inet-vm.ps1` - checks whether public ports are open from the current machine.
- `apply-migrations.ps1` - applies `supabase/migrations` to the INET-hosted database using `psql`.
- `set-vercel-env-from-file.ps1` - loads a local env file and writes selected values to Vercel production.
- `smoke-production.ps1` - checks public Vercel routes and confirms login API fails closed until DB env exists.

## Recommended INET DB Path

The current POS app uses `@supabase/supabase-js` and `@supabase/ssr`. A plain PostgreSQL URL is not enough for the current app. For the fastest cutover, provision a Supabase-compatible API on INET Cloud.

Supabase self-hosting uses Docker and exposes APIs through the gateway. Official docs list Docker as the easiest self-hosting path and document the API gateway routes for REST, Auth, Storage, and Realtime.

## Run Order

1. On this workstation:

```powershell
.\infra\inet-cloud\check-inet-vm.ps1
```

2. On the INET VM or INET-managed service:
   - Provision Supabase-compatible stack or database API.
   - Create isolated UAT tenant/store/branch/user/device seed data.
   - Deploy/start the payment bridge and expose it over HTTPS.

3. Back on this workstation, create a local secret file from:

```powershell
Copy-Item .\infra\inet-cloud\inet-production.env.example .\infra\inet-cloud\inet-production.env.local
```

4. Fill only `inet-production.env.local` with real values.

5. Push env values to Vercel:

```powershell
.\infra\inet-cloud\set-vercel-env-from-file.ps1 -EnvFile .\infra\inet-cloud\inet-production.env.local
```

6. Apply migrations after `DATABASE_URL` is filled:

```powershell
.\infra\inet-cloud\apply-migrations.ps1 -EnvFile .\infra\inet-cloud\inet-production.env.local
```

7. Redeploy Vercel production:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
& "C:\Users\Admins\AppData\Roaming\npm\vercel.cmd" --prod --yes
```

8. Smoke test:

```powershell
.\infra\inet-cloud\smoke-production.ps1
```

## No-Go Conditions

- `NEXT_PUBLIC_SUPABASE_URL` points to `*.supabase.co`.
- INET VM ports are closed and no managed database endpoint exists.
- `SUPABASE_SERVICE_ROLE_KEY`, INET merchant key, VM password, or database password is committed to GitHub.
- Bridge is not HTTPS.
- Migrations are not applied.
- Paid callback replay has not been tested.
