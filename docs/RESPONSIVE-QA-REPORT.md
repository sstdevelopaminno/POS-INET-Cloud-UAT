> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# Responsive and Device QA Report (v0.1.1)

Date: 2026-05-17

## Scope
- Environments tested (production):
  - Backoffice: https://pos-preview-phi.vercel.app
  - QR Login: https://qr-pos-preview.vercel.app
- Device profiles:
  - mobile (390x844)
  - tablet portrait (768x1024)
  - tablet landscape (1024x768)
  - desktop (1440x900)
- Routes tested:
  - `/preview/pos`
  - `/dashboard`
  - `/it-admin`
  - `qr-login /`
  - `qr-login /scan`

## Automation
- Script: `scripts/responsive-qa.mjs`
- Output JSON: `docs/qa-screenshots/results.json`
- Screenshot folder: `docs/qa-screenshots/`
- Validation command run:
  - `node scripts/responsive-qa.mjs`
  - `corepack pnpm build` (pass)

## Production QA Results
1. Horizontal overflow:
- PASS on all tested routes/devices (`hasOverflow=false`).

2. Keyboard focus layout break:
- PASS on all tested routes/devices (`brokenByFocus=false`).

3. Touch target size (>=44px):
- FAIL on multiple controls in production.
- Representative findings:
  - language selector height ~35px
  - POS category/channel buttons height ~38px
  - QR scan inputs/button height ~39px

4. Modals fit tablet screens:
- N/A in current production for tested routes (no visible modal state exposed by default).

5. PIN approval modal in portrait:
- N/A in current production for tested routes (no visible PIN modal trigger in deployed build).

6. Cart sidebar behavior:
- Could not be asserted reliably in current production from DOM markers (missing test marker in deployed build).

7. Responsive tables scroll:
- N/A for tested routes (no table rendered in those pages during this run).

## UI/Layout Hardening Applied in Code (v0.1.1)
Business logic was not changed. Only UI/layout hardening updates were added:

- Backoffice touch targets
  - Increased nav pill target size in `apps/backoffice-web/src/components/layout/app-shell.tsx`
  - Increased language switcher select height in `apps/backoffice-web/src/components/language/language-switcher.tsx`
  - Increased settings link touch area in `apps/backoffice-web/src/app/preview/pos/page.tsx`

- POS preview responsive hardening
  - Reworked `apps/backoffice-web/src/components/pos-preview/pos-preview-board.tsx`:
    - mobile/tablet-safe layout classes
    - larger interactive controls
    - cart section marker `data-cart-sidebar`
    - PIN approval preview modal trigger `data-pin-open`
    - portrait-safe modal container (`data-pin-approval-modal`)
  - Added responsive utility classes in `apps/backoffice-web/src/app/globals.css`

- QR login touch target hardening
  - Updated `apps/qr-login-web/src/app/page.tsx`
  - Updated `apps/qr-login-web/src/app/scan/page.tsx`

- QA automation hardening
  - Updated `scripts/responsive-qa.mjs`:
    - supports `BACKOFFICE_BASE_URL` and `QR_BASE_URL`
    - records cart sidebar visibility via `data-cart-sidebar`
    - attempts PIN modal open via `data-pin-open`

## Evidence
- Raw result matrix: `docs/qa-screenshots/results.json`
- Screenshots by viewport:
  - `docs/qa-screenshots/mobile/`
  - `docs/qa-screenshots/tablet-portrait/`
  - `docs/qa-screenshots/tablet-landscape/`
  - `docs/qa-screenshots/desktop/`

## Release Gate for Responsive QA
Before sign-off, run one more QA pass after deploying this v0.1.1 code:

1. Deploy updated backoffice + qr projects.
2. Re-run:
   - `node scripts/responsive-qa.mjs`
3. Confirm all acceptance checks:
   - no overflow
   - touch target >=44px for primary controls
   - PIN modal opens and fits portrait/tablet
   - cart sidebar detected and visible
   - keyboard focus does not break layout
