# Provision Supabase-Compatible API On INET Cloud

This is the next required infrastructure step for `POS-INET-Cloud-UAT`.

## Current Blocker

From the workstation, the INET VM public IP `203.154.39.123` is not reachable on:

- `22` SSH
- `80` HTTP
- `443` HTTPS
- `3389` RDP
- `5985` / `5986` WinRM
- `5432` / `6543` Postgres/Supavisor
- `8000` Supabase gateway
- `8787` payment bridge

So provisioning cannot be completed remotely until INET portal/firewall/VM access is opened.

## Why Supabase-Compatible

The POS app currently uses:

- `@supabase/supabase-js`
- `@supabase/ssr`
- Supabase-style `.from(...)` REST queries
- service-role server calls
- auth/session helper behavior
- RLS-style schema assumptions

A plain PostgreSQL `DATABASE_URL` alone is not a drop-in replacement. The fastest path is an INET-hosted Supabase-compatible API.

## Recommended Infrastructure

Preferred:

```text
INET Cloud Linux VM or managed container host
  -> Docker Compose self-hosted Supabase
  -> HTTPS reverse proxy on 443
  -> Postgres restricted to private/admin access
```

Acceptable with extra operations:

```text
INET Windows Server 2025
  -> WSL2/Ubuntu or Docker Desktop Linux containers
  -> Docker Compose self-hosted Supabase
  -> HTTPS reverse proxy
```

Fallback, larger code change:

```text
INET PostgreSQL only
  -> refactor POS data layer away from Supabase client APIs
```

## Values Needed For Vercel

After provisioning, fill `infra/inet-cloud/inet-production.env.local`:

```text
POS_DATABASE_TARGET=inet_cloud
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_INET_SUPABASE_API
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgres://...
```

Then run from the workstation:

```powershell
.\infra\inet-cloud\set-vercel-env-from-file.ps1 -EnvFile .\infra\inet-cloud\inet-production.env.local
.\infra\inet-cloud\apply-migrations.ps1 -EnvFile .\infra\inet-cloud\inet-production.env.local
```

## VM Preflight

After RDP/console access is available, copy this repo or just the `infra/inet-cloud` folder to the VM and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\inet-cloud\run-on-inet-vm.ps1 -OpenHttps
```

Use `-OpenSupabaseGateway` only for temporary direct gateway testing. For production-like UAT, put Supabase behind HTTPS on port `443`.

## Security Rules

- Do not commit `.env`, `.env.local`, `inet-production.env.local`, merchant keys, database passwords, service-role keys, or VM passwords.
- Do not expose Postgres publicly unless INET explicitly requires it and firewall allowlists are in place.
- Use HTTPS for Vercel -> INET API/bridge.
- Keep `POS_DATABASE_TARGET=inet_cloud`.
- Do not set `POS_ALLOW_SUPABASE_HOST_FOR_INET_UAT=true` unless temporarily debugging with explicit approval.
