# INET Cloud Vercel Bridge Runbook

This runbook is the UAT path for using GitHub + Vercel + INET Cloud without
opening PostgreSQL directly to the public internet.

## Current State

- INET VM runs PostgreSQL locally on `127.0.0.1:5432`.
- INET VM runs `inet-payment-bridge` on port `8787`.
- The bridge checks PostgreSQL locally through `GET /db/health`.
- Vercel can call the bridge through `INET_PAYMENT_BRIDGE_URL`.
- Direct public PostgreSQL access is intentionally not required.

## Step 1: Keep PostgreSQL Private

Do not open public inbound access to port `5432` for UAT. The bridge performs
the health check from inside the VM:

```text
Vercel -> INET bridge :8787 -> PostgreSQL 127.0.0.1:5432
```

## Step 2: Configure Vercel Bridge Health

Set these Vercel environment variables for Production:

```env
INET_PAYMENT_BRIDGE_URL=http://203.154.39.123:8787
INET_PAYMENT_BRIDGE_API_KEY=replace-with-bridge-api-key
INET_CLOUD_HEALTH_API_KEY=replace-with-health-check-api-key
POS_DATABASE_TARGET=inet_cloud
```

Then redeploy Vercel and test:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri https://pos-inet-cloud-uat.vercel.app/api/inet-cloud/db-health `
  -Headers @{"x-inet-cloud-health-key"="<INET_CLOUD_HEALTH_API_KEY>"}
```

Expected result:

```json
{
  "data": {
    "target": "inet_cloud",
    "bridge": { "reachable": true },
    "database": { "ok": true }
  },
  "error": null
}
```

## Step 3: Backend Cutover Boundary

The INET PostgreSQL schema is ready, but the Vercel app still has many
Supabase client calls. Keep the migration additive:

1. Keep payment bridge and `/api/inet-cloud/db-health` live.
2. Migrate data access module-by-module from Supabase client APIs to a
   Postgres-backed API/bridge layer.
3. Move the full Next.js backend to the INET VM only after auth/session,
   POS APIs, and payment callbacks are verified against INET PostgreSQL.

For this UAT stage, the recommended production traffic path is:

```text
Browser -> Vercel POS -> INET bridge -> INET PostgreSQL
                              |
                              +-> INET Payment UAT API
```
