# INET Cloud UAT Plan

This project is an isolated copy of POS Preview for testing the INET Cloud payment bridge. The preparation step is complete; current migration work should follow `docs/INET-CLOUD-CUTOVER-PLAN.md`.

## Architecture

```text
Vercel POS -> INET Cloud Windows Bridge -> INET UAT API
```

- Vercel POS: the deployed Next.js POS/backoffice app that will create payment requests and receive payment status updates.
- INET Cloud Windows Bridge: a Windows-hosted bridge service that will hold INET Cloud connectivity details and forward approved payment operations to INET UAT.
- INET UAT API: INET's test environment for validating payment behavior before production credentials are used.

No-Supabase database target:

```text
Vercel POS -> INET Cloud PostgreSQL
Vercel POS -> INET Cloud Windows Bridge -> INET UAT API
```

The plain PostgreSQL schema bootstrap is tracked in `docs/INET-CLOUD-POSTGRES-CUTOVER.md`.

## Files To Inspect Later

- `apps/backoffice-web/.env.example`
- `.env.inet-cloud.example`
- `apps/backoffice-web/src/lib/payments/inet-nops-client.ts`
- `apps/backoffice-web/src/lib/services/inet-nops-settings-service.ts`
- `apps/backoffice-web/src/app/api/pos/settings/inet-nops/route.ts`
- `apps/backoffice-web/src/app/api/pos/payments/inet/`
- `apps/backoffice-web/src/app/api/payments/inet/callback/route.ts`
- `apps/backoffice-web/src/components/pos-preview/inet-nops-settings-panel.tsx`
- `supabase/migrations/20260623152235_inet_nops_payment_provider.sql`
- `supabase/migrations/20260623174225_inet_nops_settings_feature.sql`
- `docs/INET-NOPS-QR-OPERATIONS-MANUAL.md`

## Test Checklist

- Confirm the copied project installs dependencies independently with `pnpm install`.
- Run TypeScript verification with `pnpm --filter backoffice-web exec tsc -p tsconfig.json --noEmit --pretty false`.
- Confirm `.env.local` files were not copied from the source project.
- Create a local env file from `.env.inet-cloud.example` only when real UAT values are available.
- Keep `INET_ENABLED=false` until the bridge endpoint and callback secret are ready.
- Verify the POS still loads with existing manual payment behavior before changing INET Cloud code.
- Later, test bridge timeout behavior using `INET_TIMEOUT_MS=15000`.
- Later, test callback validation using a non-production `INET_CALLBACK_SECRET`.
- Later, verify failed, duplicate, delayed, and mismatched payment callback scenarios.

## Security Notes

- Do not commit real INET, Supabase, Vercel, service-role, database, or callback secrets.
- Keep merchant keys and callback secrets server-side only. Do not expose them through `NEXT_PUBLIC_` variables.
- The Windows Bridge should validate caller identity, request signatures, amount, order id, and callback authenticity before forwarding or accepting payment state changes.
- The POS app should continue resolving tenant, branch, user, and POS session on the server. Do not trust client-submitted tenant or branch identifiers.
- UAT and production credentials must stay separated. Never reuse UAT placeholders for production rollout.
- Log payment diagnostics without storing full secrets, tokens, or sensitive customer/payment payloads.

## Current Scope

Prepared only:

- Isolated project copy.
- UAT planning document.
- Sanitized INET Cloud env template.
- README note for the isolated project.
- Bridge-aware POS environment placeholders.
- Vercel deployment preparation.
- INET Cloud cutover checklist in `docs/INET-CLOUD-CUTOVER-PLAN.md`.

Not prepared yet:

- Stable INET Cloud server hosting for the bridge.
- INET Cloud database cutover.
- Full no-Supabase backend data/auth refactor from Supabase APIs to direct PostgreSQL.
- Final Vercel environment switch from temporary bridge URL to stable INET Cloud bridge URL.
