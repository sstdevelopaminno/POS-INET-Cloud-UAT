> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# MVP Release Notes - POS Preview

Release date: 2026-05-17  
Repository: `sstdevelopaminno/POS-Preview.git`  
Release commit: `a3c3087`  
Production URL: `https://pos-preview-phi.vercel.app`

## Summary

This MVP delivers a production-deployed multi-tenant POS preview foundation with:

- Next.js 16 monorepo web apps (`backoffice-web`, `qr-login-web`)
- Supabase-ready architecture with tenant isolation design and RLS planning
- Shared contracts/types for web and Android handoff
- Back Office + IT Admin route surface
- POS preview UI for design review
- Core approval and shift guardrail logic with integration test coverage

## Included in this release

1. Monorepo and app structure
- `apps/backoffice-web` (Back Office + IT Admin + contracts API + POS preview)
- `apps/qr-login-web` (QR/PIN verification preview)
- Shared packages in `packages/`

2. Production deployment
- Vercel project: `pos-preview`
- Successful production deployment on commit `a3c3087`
- Core routes reachable and healthy

3. Security and configuration checks
- Required Supabase env variables configured in production
- Service-role usage isolated to server-only code path
- No client-side exposure of service-role key detected

4. Business rules currently covered
- PIN approval flow scaffold
- Shift close restrictions for unpaid dine-in and mismatch override
- Stock adjustment approval requirement
- Manual delivery channel support (`grab`, `line_man`, `shopee`, `merchant_app`)

5. Testing status
- `backoffice-web` integration tests for approval/shift rules passing
- Both `backoffice-web` and `qr-login-web` builds passing
- QR verify validation behavior (`422` invalid payload) confirmed in QR app route

## Vercel monorepo settings (confirmed)

- Root Directory: `apps/backoffice-web`
- Install Command: `pnpm install`
- Build Command: `pnpm build`
- Framework Preset: `Next.js`
- Output Directory: `Next.js default` (`.next`)

## Known limitations

1. Audit log persistence path is placeholder (`appendAuditLog`) and requires real DB insert implementation.
2. Direct production API business-flow QA is blocked without authenticated test session.
3. QR verify endpoint is in `qr-login-web` app and not exposed on `pos-preview` URL.
4. Full responsive visual QA automation (mobile/desktop/tablet orientations) is not completed yet.

## Release readiness status

Current status: **Conditional Ready (MVP Preview Release)**

Ready now for:
- Architecture validation
- Route and deployment validation
- UI/UX preview review
- Contract handoff iteration

Not yet ready for full production operations until:
- Real audit log writes are verified
- Authenticated production QA for protected APIs is completed
- Final responsive/viewport QA sign-off is completed

## Next recommended actions

1. Implement and verify real `audit_logs` inserts against Supabase.
2. Establish authenticated QA script/user flow for protected API production tests.
3. Decide QR app deployment strategy (separate Vercel project/domain or unified routing).
4. Complete manual + automated responsive checks for mobile/desktop/tablet.

