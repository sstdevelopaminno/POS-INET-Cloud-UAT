# POS Offline/Unstable Network Resilience

## Goals
- UI must not freeze when network is slow/disconnected.
- Button actions must recover safely (no permanent loading lock).
- Order/payment writes must remain idempotent and retry-safe.
- Multi-branch usage must not leak pending data across scopes.

## Implemented in POS Sales Screen

## 1) Pending Outbox Queue
- Local key: `pos_pending_submit_queue_v001`
- Stores multiple pending order-create payloads, not just one item.
- Each queue item tracks:
  - `idempotencyKey`
  - `queued_at`
  - `retry_count`
  - `last_error`
- Legacy single pending key is migrated on load.

## 1.1) Pending Payment Queue (Transfer)
- Local key: `pos_pending_payment_queue_v001`
- Transfer payments are queued with request id and replayed when online.
- Uses idempotency key (`x-idempotency-key`) to prevent double payment.

## 2) Auto Replay when Network Returns
- When `online` and queue has items, system auto-retries first queue item.
- Uses exponential backoff (1s up to 30s).
- Retry remains idempotent because each item keeps same idempotency key.

## 3) Scope Isolation (Tenant/Branch)
- On tenant/branch scope change:
  - clears cart, outbox queue, held bills, active order local cache.
- Prevents cross-branch data contamination.

## 4) Connectivity-aware Error Handling
- Timeout/network errors are normalized and treated as connectivity issues.
- UI state switches to offline mode and avoids infinite API retry loops.
- Critical catch paths (open bill/cancel/payment/stock/load) mark network state.

## 5) Recovery UX
- Pending sync count shown in status strip.
- Manual retry button is active when queue exists and network is online.
- Checkout lock is always released in finally paths.

## Operational Notes
- Backend still enforces transactional integrity and idempotency.
- Local queue is best effort for unstable internet, not a replacement for server durability.
- Recommended to monitor `/api/pos/monitor` for queue/dead-letter pressure in production.
