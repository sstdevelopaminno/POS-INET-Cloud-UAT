# Production QA Checklist (POS Preview)

Last updated: 2026-05-26  
Repository: `POS Preview` monorepo  
Scope: `apps/backoffice-web` (unified login + POS)

## 1) Deployment and workspace checks

- [x] Vercel production project is `pos-preview` only
- [x] Vercel Root Directory = `apps/backoffice-web`
- [x] Vercel Install Command = `pnpm install`
- [x] Vercel Build Command = `pnpm build`
- [x] Vercel Framework Preset = `Next.js`
- [x] Vercel Output Directory = `Next.js default` (equivalent to `.next`)
- [x] Monorepo remains `pnpm` workspace compatible

## 2) Supabase environment checks (production)

Required keys exist in Vercel production env:

- [x] `NEXT_PUBLIC_SUPABASE_URL`
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_ROLE_KEY`

Security usage validation:

- [x] Public keys used in client-safe/server auth context only
- [x] Service role key used in server-only path (`supabase-admin`/API flow)
- [x] No service role key exposed to client components

## 3) Route health checks (production)

All checks run against `https://pos-preview-phi.vercel.app`:

- [x] `GET /` -> `200`
- [x] `GET /dashboard` -> `200`
- [x] `GET /preview/pos` -> `200`
- [x] `GET /it-admin` -> `200`
- [x] `GET /api/contracts` -> `200`

## 4) Business flow checks

### 4.1 Verified

- [x] Shift close blocked when unpaid dine-in exists (`409`) (integration + local API)
- [x] Shift close mismatch requires override (`409` without override, `200` with override)
- [x] Stock adjustment requires manager/owner approval (`403` without approval)
- [x] Manual delivery supports channels:
  - [x] `grab`
  - [x] `line_man`
  - [x] `shopee`
  - [x] `merchant_app`
- [x] QR verify validation logic returns `422` for invalid payload (QR app route test)
- [x] PIN approval flow returns success for valid manager PIN in current test setup

### 4.2 Blocked in direct production API QA (auth-gated)

- [ ] Staff cancel bill without manager PIN (direct production API call blocked by `401` without session)
- [ ] Manager PIN approval audit log persistence in DB (see known limitations)

## 5) Responsive/UI checks

- [x] Core Back Office pages render in production
- [~] Responsive behavior partially verified by CSS/media rules and manual route loading
- [ ] Full viewport visual QA automation (mobile/desktop) not completed in this environment
- [ ] POS preview landscape/portrait visual acceptance not fully automated yet

## 6) Known limitations (must track)

1. Direct production business-flow API validation still needs authenticated QA session/token flow.
2. Login/auth APIs are served from `backoffice-web`; validate on the same deployment surface as POS.
3. Full visual responsive regression checks still need browser-driven QA pass.
4. Go-live evidence collection is still pending in `docs/go-live-evidence-checklist.md`.

## 7) Release criteria

Minimum criteria to mark MVP release-ready:

- [x] Production deploy successful
- [x] Core routes healthy (`200`)
- [x] Build passes for `backoffice-web`
- [x] Approval/shift integration tests pass
- [x] Audit log write path implemented server-side with compatibility fallback in `apps/backoffice-web/src/lib/audit-log.ts`
- [ ] Audit log write path verified against Supabase table in production-like environment (evidence attached)
- [ ] Authenticated production QA pass for protected business APIs
- [ ] Responsive acceptance sign-off for mobile, desktop, tablet portrait, tablet landscape
