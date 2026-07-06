# POS Android placeholder

Android POS app will be implemented separately.

Use these contracts from this monorepo:
- Shared types: `../../packages/shared-types/src/index.ts`
- Runtime contract endpoint: `../../apps/backoffice-web/src/app/api/contracts/route.ts`
- POS screen behavior preview: `../../apps/backoffice-web/src/app/preview/pos/page.tsx`

Planned Android modules:
- Offline queue and sync retries
- QR login and token exchange with `/api/verify`
- Order submit + shift endpoints from `/api/backoffice/*`

