# INET Cloud Cutover Plan

This document is the working plan for moving `POS-INET-Cloud-UAT` from temporary UAT wiring to a stable GitHub + Vercel + INET Cloud server/database setup.

## Current State

- Source project: `POS-INET-Cloud-UAT`, copied from `POS-Preview`.
- Web app target: Vercel project `pos-inet-cloud-uat`.
- Payment bridge: standalone Node.js/Fastify service in `E:\INET-Payment-Bridge`.
- INET payment target: INET Payment UAT.
- Database today: Supabase-compatible Postgres configuration is still used by the POS app.
- Temporary tunnel URLs must not be treated as production or stable UAT infrastructure.

## Target Architecture

```text
GitHub repo
  -> Vercel POS web app
      -> INET Payment Bridge on INET Cloud server
          -> INET Payment UAT API
      -> INET Cloud database
```

- GitHub is the source of truth for code.
- Vercel deploys the POS web app from GitHub.
- INET Cloud server hosts the bridge with a stable HTTPS endpoint.
- INET Cloud database becomes the POS database target after migration.
- INET secrets stay only in bridge/server environment variables.
- Vercel only stores bridge URL, bridge API key, database connection values, and POS callback config required by server-side code.

## Phase 0 - GitHub Bootstrap

The current folder must be a valid Git repository before Vercel can deploy from GitHub. If `.git` is empty or `git status` fails, initialize a new repository and push this isolated UAT copy to a new GitHub project.

```powershell
git init
git add .
git commit -m "Prepare POS INET Cloud UAT"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/pos-inet-cloud-uat.git
git push -u origin main
```

Before commit, confirm no real `.env`, INET secret, database password, Vercel token, or service-role key is staged.

## Phase 1 - Stabilize Bridge

1. Provision INET Cloud server with a fixed public endpoint or domain.
2. Install Node.js LTS and run the bridge as a Windows service or supervised process.
3. Configure bridge environment from `.env.example` in `E:\INET-Payment-Bridge`.
4. Set bridge `AP_URL` to `https://pos-inet-cloud-uat.vercel.app/payment/inet/result`.
5. Set bridge POS callback URL to `https://pos-inet-cloud-uat.vercel.app/api/payments/inet/callback`.
6. Verify:
   - `GET /health`
   - `GET /ip`
   - `POST /inet/create-qr`
   - duplicate idempotency request
   - callback signature/secret rejection

## Phase 2 - Connect Vercel POS To Bridge

Set these Vercel environment variables for `pos-inet-cloud-uat`:

```text
INET_PAYMENT_BRIDGE_URL=https://BRIDGE_DOMAIN_OR_IP
INET_PAYMENT_BRIDGE_API_KEY=SERVER_SIDE_SECRET
INET_NOPS_ENV=uat
INET_NOPS_AP_URL_UAT=https://pos-inet-cloud-uat.vercel.app/payment/inet/result
INET_NOPS_CALLBACK_PUBLIC_URL=https://pos-inet-cloud-uat.vercel.app/api/payments/inet/callback
```

Do not set INET merchant secrets in frontend variables. Do not use `NEXT_PUBLIC_` for INET secrets.

## Phase 3 - Move Database To INET Cloud

Preferred target is Postgres so the existing Supabase schema and SQL migrations remain portable.

1. Provision INET Cloud Postgres-compatible database.
2. Confirm SSL mode, host, port, database name, user, and migration account.
3. Export schema and data from current UAT database.
4. Apply migrations in the same order as the repository `supabase/migrations` directory.
5. Import seed/UAT data only after schema and policies are verified.
6. Configure Vercel server-side database env values.
7. Run login, POS order, payment, receipt, and admin smoke tests.

If INET Cloud database is not Supabase-managed, verify replacement behavior for Auth, RLS, storage, and service-role operations before cutover.

## Phase 4 - End-To-End UAT

Use one real UAT order flow:

1. Login to the Vercel POS app.
2. Create takeaway order.
3. Select INET QR payment.
4. Confirm bridge creates QR from INET UAT.
5. Confirm payment result page loads.
6. Simulate or receive INET paid callback.
7. Confirm POS marks payment paid once.
8. Replay callback and confirm it does not double-settle.
9. Test failed, expired, mismatched amount, and unknown order callbacks.

## Required From INET / Infra

- INET Cloud server OS, public IP, domain, and access method.
- HTTPS certificate or reverse proxy plan.
- INET Cloud database type and connection details.
- Network allowlist requirements for INET Payment UAT.
- Confirmed INET callback payload, signature method, and retry behavior.
- GitHub repository URL and deploy branch.
- Vercel project owner/team access for environment variables.

## Commands

From `E:\POS-INET-Cloud-UAT`:

```powershell
pnpm install
pnpm --filter backoffice-web typecheck
pnpm --filter backoffice-web build
```

From `E:\INET-Payment-Bridge`:

```powershell
npm install
npm run typecheck
npm run build
npm run start
```

## No-Go Conditions

- Bridge still uses a temporary local tunnel.
- INET or database secrets are committed to GitHub.
- Vercel env points to a stale bridge URL.
- Database cutover has not been smoke-tested.
- Callback idempotency is not verified.
