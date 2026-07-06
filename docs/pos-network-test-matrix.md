# POS Network Stress Test Matrix

## Goal
- Validate POS stability under unstable internet for multi-tenant, multi-branch usage.

## Scenarios

1. `Offline hard drop`
- Disconnect network during:
  - create order
  - cancel bill
  - cash payment
  - transfer payment
- Expected:
  - UI never hard-freezes
  - action is queued (if applicable)
  - emergency retry button appears
  - sync resumes when internet is back

2. `High latency`
- Simulate RTT 800ms-2500ms.
- Expected:
  - no duplicate bill
  - no duplicate payment
  - loading states recover automatically

3. `Packet loss 10%-30%`
- Expected:
  - timeout/retry paths activate
  - outbox queue grows and drains safely
  - no blocked UI controls after retry

4. `Intermittent flap`
- Online/offline toggle every 10-20 seconds for 5 minutes.
- Expected:
  - queued actions survive and replay
  - monitor shows pending/dead-letter pressure correctly

5. `Multi-branch parallel`
- Run scenario 1-4 on at least 3 branches in same tenant.
- Expected:
  - queue/monitor values remain isolated by branch
  - no cross-branch data leakage in local cache

## Pass Criteria
- `0` duplicate orders from same idempotency key.
- `0` duplicate payments from same request group id.
- No stuck state where user must refresh browser to continue.
- No stock mismatch caused by retried same request id.

## API/Monitor Checks
- Branch monitor: `GET /api/pos/monitor`
- Tenant admin monitor: `GET /api/admin/pos/monitor`

## Incident Quick Actions
- If pending sync grows continuously:
  1. check `print_queue_depth` and `dead_letters_recent`
  2. verify branch internet path
  3. use emergency retry once connection is stable
