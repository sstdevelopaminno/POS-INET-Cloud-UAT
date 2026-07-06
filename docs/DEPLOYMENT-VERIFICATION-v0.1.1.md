> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# Deployment Verification v0.1.1

Date: 2026-05-18

## Scope
Recovery and verification for production hardening deployments after Vercel token failure.

Projects:
- Backoffice: `pos-preview`
- QR Login: `qr-pos-preview`

## 1) Authentication Recovery
Original failure:
- `Error: The specified token is not valid`

Recovery actions:
1. Switched to CLI execution via `cmd /c vercel ...` to avoid PowerShell script policy wrapper issues.
2. Used a valid token explicitly with `--token`.
3. Re-linked root workspace to the correct Vercel project contexts as needed:
   - linked to `qr-pos-preview` for QR deployment
   - linked back to `pos-preview` afterward

## 2) Production Redeploy Results

### pos-preview
- Deployment ID: `dpl_AD2SEKjBX5c4f3xMaW77SfnhVo7U`
- State: `READY`
- Production URL: `https://pos-preview-ra4088atf-sstdevelopaminnos-projects.vercel.app`
- Alias active: `https://pos-preview-phi.vercel.app`

### qr-pos-preview
- Deployment ID: `dpl_61rH5zDHE28CDDt1NaqY4Fn7XgMX`
- State: `READY`
- Production URL: `https://qr-pos-preview-4l8tm9w0t-sstdevelopaminnos-projects.vercel.app`
- Alias active: `https://qr-pos-preview.vercel.app`

## 3) Route Verification

GET checks:
- `https://pos-preview-phi.vercel.app/` -> `200`
- `https://pos-preview-phi.vercel.app/dashboard` -> `200`
- `https://pos-preview-phi.vercel.app/preview/pos` -> `200`
- `https://pos-preview-phi.vercel.app/it-admin` -> `200`
- `https://pos-preview-phi.vercel.app/api/contracts` -> `200`
- `https://qr-pos-preview.vercel.app/scan` -> `200`

QR verify API checks:
- `POST https://qr-pos-preview.vercel.app/api/verify` with invalid payload `{}` -> `422`
- `POST https://qr-pos-preview.vercel.app/api/verify` with valid payload -> `200`

## 4) Commit Deployment Confirmation
Required commits:
- `9499ab6`
- `da5846b`

Verification evidence:
1. `da5846b` signature confirmed on production:
   - `/api/contracts` returns `version: "2026-05-18"`
   - endpoint headers include `x-idempotency-key` for:
     - `/api/backoffice/orders`
     - `/api/backoffice/stock/adjust`

2. `9499ab6` signature confirmed on production:
   - `/preview/pos` HTML contains `data-pin-open` and Thai label `ตัวอย่าง PIN อนุมัติผู้จัดการ` (responsive hardening marker)

Conclusion:
- Latest hardening commits are active in production aliases.

## 5) Constraints / Notes
- No business logic changes were introduced during this recovery round.
- No new features were added in this round.

## 6) Final Status
Deployment recovery for v0.1.1 is complete.
- Token issue mitigated for this run using explicit valid token in CLI command.
- Both production projects are `READY`.
- All required routes and QR verification endpoint checks passed.
