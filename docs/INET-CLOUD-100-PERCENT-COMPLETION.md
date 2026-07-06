# INET Cloud 100 Percent Completion Checklist

This checklist defines what "100 percent complete" means for `POS-INET-Cloud-UAT`.

## Completed

- GitHub repo exists: `sstdevelopaminno/POS-INET-Cloud-UAT`.
- Vercel project exists: `pos-inet-cloud-uat`.
- Production URL exists: `https://pos-inet-cloud-uat.vercel.app`.
- INET Payment UAT server-side env values are configured on Vercel, except bridge URL/key because the bridge is not reachable yet.
- `POS_DATABASE_TARGET=inet_cloud` is configured.
- POS Preview Supabase env values were removed from Vercel.
- Runtime guard refuses `*.supabase.co` when `POS_DATABASE_TARGET=inet_cloud`.
- `/login` and `/payment/inet/result` are publicly reachable.
- Store login API fails closed until the INET database/API is configured.

## Not Complete Until INET VM/Database Is Live

- INET VM public ports are still closed or timing out from this workstation.
- No public INET-hosted Supabase-compatible API URL is available yet.
- No INET-hosted anon/publishable key is available yet.
- No INET-hosted service-role key is available yet.
- SQL migrations have not been applied to an INET-hosted database.
- Bridge HTTPS URL is not available yet.
- End-to-end payment callback replay/idempotency is not verified.
- Remote provisioning is blocked until INET VM access is available through portal/RDP/WinRM/SSH or INET provides a managed database endpoint.

## Required INET Values

Use `infra/inet-cloud/inet-production.env.example` as the local template. Real values must be stored only in `inet-production.env.local` or Vercel environment variables.

Required for database cutover:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Postgres host, port, database, migration user, password, and SSL mode

Required for bridge cutover:

- `INET_PAYMENT_BRIDGE_URL`
- `INET_PAYMENT_BRIDGE_API_KEY`

## Final Verification

1. `infra/inet-cloud/check-inet-vm.ps1` shows required INET ports open.
2. Vercel env contains all required INET values.
3. `pnpm --filter backoffice-web typecheck` passes.
4. Vercel production deploy is Ready.
5. `infra/inet-cloud/smoke-production.ps1` passes.
6. Login works against INET-hosted data.
7. INET QR create works.
8. Paid callback settles once.
9. Callback replay does not double-settle.
10. No POS Preview database is used.
