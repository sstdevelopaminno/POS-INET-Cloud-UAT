> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# Production E2E Smoke Evidence (PASSED)

- Date (UTC+7): 2026-05-27 22:11
- Environment: production
- Single host URL: `https://sstipos-ten.vercel.app`
- Script: `scripts/login-pos-e2e-smoke.mjs`
- Result file: `docs/qa-screenshots/login-pos-e2e-smoke/results.json`

## Scope Verified

1. Login flow:
   - `/login/store`
   - `/login/branches`
   - `/login/employee`
   - `/login/devices`
2. Redirect to POS:
   - `/pos/orders`
3. Session gate:
   - `GET /api/pos/session/current` returns `200` after login
4. Shift/sales gate:
   - auto-open shift guard when needed
   - `GET /api/pos/products` returns `200`
5. Session expiry path:
   - clear cookies
   - `GET /api/pos/session/current` returns `401 missing_pos_session`
   - `GET /api/pos/products` blocked with `401 missing_pos_session`
   - UI gate blocks product cards

## Final Status

- `happy_path`: `passed`
- `session_expired_path`: `passed`
- Suite result: `passed`

## Key Architecture Change Applied

`sstipos` (POS project) now acts as the single-entry host and proxies login-related routes to ID app origin via Next.js rewrites:

- `/login/:path*`
- `/scan/:path*`
- `/api/auth/:path*`
- `/api/store/:path*`
- `/api/mobile/:path*`
- `/api/verify`
- `/_next/:path*` and `/brand/:path*` (guarded by login/scan referer)

This removes cross-host cookie handoff issues and stabilizes login -> POS session continuity for production.
