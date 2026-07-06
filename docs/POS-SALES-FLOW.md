# POS Sales Flow v0.1.2 (Real Module)

Date: 2026-05-18

## Scope
This version replaces preview POS flow with real POS APIs and production-oriented flow:
- `/pos/sales`
- `/pos/orders`
- `/pos/shift`
- `/pos/payments`

## Core Principles
1. Business logic is API-first and compatible with Web/PWA, Android, and future iOS apps.
2. Payment success must not be blocked by printer failures.
3. Submit operations are idempotent using request keys.
4. Realtime is intentionally not implemented in this phase.

## API Summary

### Sales
- `GET /api/pos/sales`
  - returns active products, category list, and current open shift
- `POST /api/pos/sales`
  - creates POS order with transaction-safe stock deduction
  - supports `dine_in`, `takeaway`, `delivery_manual`

### Orders
- `GET /api/pos/orders`
  - paginated order list with nested items/payments
- `POST /api/pos/orders/[orderId]/cancel`
  - requires manager/owner override (`cancellation_approval_id`)

### Shift
- `GET /api/pos/shift`
  - current shift snapshot + queued order count
- `POST /api/pos/shift`
  - `action=open` to open shift
  - `action=close` to close shift (supports override id for mismatch/unpaid dine-in)

### Payments
- `GET /api/pos/payments?status=queued`
  - payable queued order list
- `POST /api/pos/payments`
  - split-payment-ready structure via `payment_lines[]`
  - updates order to `completed`
  - triggers receipt print and optional kitchen print

## Transaction and Retry Safety

### Order transaction
- SQL function: `app.create_pos_order_tx`
- handles:
  - idempotent replay by `orders.request_id`
  - order + order_items insert
  - stock deduction with insufficient-stock guard

### Payment transaction
- SQL function: `app.complete_pos_payment_tx`
- handles:
  - split lines validation
  - total paid must match order total
  - idempotent replay by `payments.request_group_id`
  - updates order status to `completed`

## Offline-safe and Optimistic UI Behavior
- `/pos/sales`:
  - optimistic cart updates in memory
  - local cart persistence in `localStorage`
  - offline staged submit payload with retry action
  - idempotency key persisted for safe re-submit

## Manager Override Modal Coverage
- cancel bill (`cancel_bill`)
- stock adjustment (`stock_adjustment`)
- shift close mismatch/unpaid (`shift_close_override`)

## Printing Integration
- Payment endpoint queues print jobs after successful payment:
  - receipt printer role (always)
  - kitchen printer role (optional trigger)
- print failures are returned as warning fields and do not rollback payment.

## Future Compatibility Notes
- Web/PWA flow uses backend contracts only, no platform-native dependency.
- Android/iOS native apps can reuse the same `/api/pos/*` contracts.
- Flutter/native implementations are intentionally deferred.
