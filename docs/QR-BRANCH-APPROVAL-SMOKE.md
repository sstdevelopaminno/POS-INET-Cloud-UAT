> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# QR Branch Approval Smoke Test

## 1) Apply migration
Run this migration before testing branch-scope QR:

- `supabase/migrations/202605270001_pos_qr_branch_scope.sql`

Command:

```bash
supabase db push
```

If your CLI is not linked yet:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## 2) Mobile-side approve API
After mobile scanner reads POS QR, call:

`POST /api/auth/employee/qr/approve`

Body example:

```json
{
  "qr_token": "<token-or-parsed-from-qr-payload>",
  "employee_code": "EMP-000103"
}
```

Optional header when server uses approval secret:

- `x-pos-qr-approval-key: <POS_QR_APPROVAL_KEY>`

## 3) End-to-end smoke script
Script file:

- `scripts/qr-branch-approve-smoke.mjs`

Run:

```bash
POS_SMOKE_STORE_CODE=<store_code> \
POS_SMOKE_EMPLOYEE_CODE=<employee_code> \
POS_SMOKE_BRANCH_CODE=<optional_branch_code> \
POS_QR_APPROVAL_KEY=<optional_key> \
npm run qa:qr-branch-approve
```

Output report:

- `docs/qa-screenshots/qr-branch-approve-smoke/results.json`
