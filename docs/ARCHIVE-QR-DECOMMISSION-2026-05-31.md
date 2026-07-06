# ARCHIVED: QR Login Decommission Record (2026-05-31)

Status: `ARCHIVED`  
Effective date: `2026-05-31`

## Scope
- Decommission `apps/qr-login-web` from active workspace and deployment pipeline.
- Keep files for historical traceability only.
- Use unified login in `apps/backoffice-web` only:
  - `/login/store`
  - `/login/branches` (when needed)
  - `/login/employee`
  - `/login/devices`

## Technical Actions
- `pnpm-workspace.yaml` now excludes `apps/qr-login-web`.
- `apps/qr-login-web/package.json` scripts are blocked with a decommission error.
- `apps/qr-login-web/vercel.json` install/build are blocked with a decommission error.
- `apps/qr-login-web/wrangler.toml` worker name marked as decommissioned.
- Root CI/build/lint/typecheck/test already target `backoffice-web` only.

## Operational Impact
- QR-scan login is no longer a supported runtime path.
- Owner multi-branch login now runs on a single path with server-side scope enforcement.
- Historical QR documents remain for audit/evidence and are marked `ARCHIVED`.

