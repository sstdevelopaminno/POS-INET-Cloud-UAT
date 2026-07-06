# API Route Design

Base: `apps/backoffice-web/src/app/api`

## Back Office endpoints
- `POST /api/backoffice/orders`
  - Create POS order and manual delivery order payload.
  - Fields include `channel`, `external_order_code`, order totals, and item list.

- `POST /api/backoffice/approvals/pin`
  - Validate manager/owner PIN.
  - Returns approval context for privileged workflows.

- `POST /api/backoffice/stock/adjust`
  - Create stock adjustment movement.
  - Requires `approval_id` for manual adjustment.

- `POST /api/backoffice/shifts/close`
  - Close shift with validation for unpaid dine-in bills and cash mismatch.
  - Requires manager override approval when violations exist.

## IT Admin endpoints
- `POST /api/it-admin/tenants`
  - Activate/create new tenant and package link.

## Contract endpoint
- `GET /api/contracts`
  - Machine-readable contract summary for Android POS integration.

## Planned next endpoints
- `POST /api/backoffice/orders/{id}/cancel`
- `POST /api/backoffice/shifts/open`
- `GET /api/backoffice/reports/sales`
- `GET /api/backoffice/reports/stock`
- `GET /api/backoffice/reports/audit`
- `POST /api/qr-login/sessions`

