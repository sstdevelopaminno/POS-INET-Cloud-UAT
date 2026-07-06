# Monitoring and Alerting Runbook

## Log Sources
- Vercel logs:
  - Function logs (runtime errors, latency).
  - Deployment logs (build failures).
- Supabase logs:
  - Database logs (query errors, auth, RLS denials).
  - API logs (PostgREST errors).

## Key Signals
- API error rate spike (4xx/5xx).
- Login failure spike (`auth_failed`, `context_*`, `feature_not_enabled`).
- QR/staff-card token failures spike (`qr_token_*`, `staff_card_*`).
- Device mismatch spike (`device_branch_mismatch`, `device_tenant_mismatch`).
- Order creation failure rate increase.
- Payment failure rate increase.
- Slow queries / timeout increase.
- Migration apply failure.
- Rate-limiter backend error spike (`backend_unavailable` or Upstash REST errors).

## Alert Ownership
- Primary: Platform/Backend on-call.
- Secondary: POS operations owner.
- Escalation: engineering lead + incident commander.

## Response Targets
- P1 (production outage/security): acknowledge <= 5 min.
- P2 (major degradation): acknowledge <= 15 min.
- P3 (minor issue): acknowledge <= 60 min.

## Dashboard/Review Cadence
- Daily review: error trends, login anomalies, failed payments/orders.
- Weekly review: slow-query and RLS denial trends.

## Minimum Alert Rules
- Error rate > baseline for 5 min.
- Login failure ratio > threshold.
- Rate-limit spike / fail-closed spike on `qr_verify|pin_verify|staff_card_verify`.
- Payment failure ratio > threshold.
- Migration command failure event.
