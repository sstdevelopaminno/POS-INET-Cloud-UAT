# Stock Engine Architecture (v0.1.1 Hardening)

## Objective
- Prevent negative stock at database level.
- Keep order creation + recipe deduction atomic.
- Support concurrent order requests safely.
- Add duplicate request protection (idempotency).
- Ensure rollback safety when deduction fails.

## Scope
- Backend only.
- No UI changes.
- No realtime implementation in this phase.

## Design

### 1) Database Transaction Functions
The core write path is moved into SQL transaction functions (PL/pgSQL):

- `app.create_manual_delivery_order_tx(...)`
  - Creates `orders` + `order_items`.
  - Aggregates recipe requirements from items.
  - Deducts ingredient stock with guarded updates.
  - Inserts `stock_movements` (`sale_deduction`) in the same transaction.
  - Returns one row with `order_id`, status, created_at, and duplicate flag.

- `app.create_stock_adjustment_tx(...)`
  - Applies manual adjustment with guarded stock update.
  - Inserts `stock_movements` (`manual_adjustment`) in the same transaction.
  - Returns one row with movement id, status, created_at, and duplicate flag.

Because each function runs within a single DB transaction, any error raises exception and rolls back all writes in that call.

### 2) Negative Stock Protection
Two layers are used:

- `ingredients.quantity_on_hand >= 0` check constraint.
- Guarded update conditions:
  - Deduction only succeeds when `quantity_on_hand >= required_qty`.
  - If not enough stock, function raises `INSUFFICIENT_STOCK`.

This prevents race conditions and negative values under concurrent writes.

### 3) Concurrency Safety
Order stock deduction uses SQL `UPDATE ... WHERE quantity_on_hand >= required_qty` for each ingredient.

- Concurrent transactions compete on the same ingredient rows.
- Only one transaction can reduce stock when limited quantity remains.
- Losing transaction gets `INSUFFICIENT_STOCK` and is rolled back.

### 4) Idempotency / Duplicate Request Protection
- Added `orders.request_id` with unique index `(tenant_id, branch_id, request_id)` where non-null.
- Added `stock_movements.request_id` with unique index for manual adjustment replay protection.
- API can pass `x-idempotency-key` header.
- Replay returns the original record with `duplicate_request=true`.

### 5) Service Layer
Routes now call `stock-transaction-service`:

- `executeCreateManualDeliveryOrderTransaction`
- `executeStockAdjustmentTransaction`

Responsibilities:
- Validate payload scope.
- Call RPC transaction functions.
- Map DB errors to API errors.
- Persist audit logs for success/failure/replay.

## Files Added/Changed
- Migration:
  - `supabase/migrations/202605180001_stock_engine_hardening.sql`
- Service:
  - `apps/backoffice-web/src/lib/services/stock-transaction-service.ts`
- Routes:
  - `apps/backoffice-web/src/app/api/backoffice/orders/route.ts`
  - `apps/backoffice-web/src/app/api/backoffice/stock/adjust/route.ts`
- Contract docs endpoint:
  - `apps/backoffice-web/src/app/api/contracts/route.ts`
- Tests:
  - `apps/backoffice-web/tests/integration/stock-transaction.integration.test.ts`

## Failure Behavior
- Any stock deduction failure returns `409 insufficient_stock`.
- Invalid payload / invalid product / invalid quantity returns `422`.
- Approval mismatch for manual adjustment returns `403`.
- Audit log failure does not crash core business flow (existing audit hardening behavior retained).

## Rollback Guarantees
If any step fails inside transaction function:
- Order row is not partially committed.
- Order items are not partially committed.
- Ingredient quantities are not partially updated.
- Stock movements are not partially inserted.

All-or-nothing behavior is guaranteed per request execution.
