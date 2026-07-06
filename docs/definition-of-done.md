# Definition of Done: POS Multi-owner / Multi-branch (100%)

This document defines the exact conditions required before the platform is considered 100% complete for production go-live.

## A) Functional Readiness
- [Done] Tenant creation is available with scoped validation.
- [Done] Branch creation is available and quota-gated.
- [Done] User creation/assignment is available.
- [Done] `user_branch_roles` assignment enforces tenant+branch scope.
- [Done] Device registration/approval is operational.
- [Done] Store code -> branch -> scan flow uses secure opaque `ctx`.
- [Done] Real QR/PIN/staff-card verification endpoints are implemented.
- [Done] Successful authentication creates `pos_sessions`.
- [Done] Login context is consumed and replay is blocked.
- [Done] Shift open/join/close is implemented and session-bound.
- [Done] POS Sales MVP can create and pay at least one order.
- [Done] Payment MVP is implemented with scoped payment records.
- [Done] Receipt preview is available after successful payment.
- [Done] Attendance summary/details are visible for owner/manager.
- [Done] Staff permission boundaries are enforced.
- [Done] Backoffice management routes/APIs are available.
- [Done] Package/feature gate and quota enforcement are implemented.

## B) Security Readiness
- [Done] Server does not trust `tenant_id`, `branch_id`, `device_code` from client payload/URL.
- [Done] Login handoff uses opaque context only.
- [Done] Login context is short-lived.
- [Done] Successful login consumes context (`status=consumed`).
- [Done] Reuse of consumed context is rejected (`context_replay_detected`).
- [Done] Server-side permission checks are required on sensitive APIs.
- [Done] Service role key is server-only.
- [Done] RLS is enabled for core multi-tenant tables.
- [Done] Audit logs are written for high-risk operations.
- [Done] Rate limiting exists on public/security-sensitive login endpoints.
- [Must do before go-live] Complete secret rotation audit with evidence.

## C) Performance Readiness
- [Done] Core login/session/order/payment tables have tenant/branch and lookup indexes.
- [Done] POS UI is responsive for tablet/iPad layout targets.
- [Done] Login and order APIs have bounded logic and scoped queries.
- [Done] Attendance real-time behavior uses scoped polling (no broad branch-agnostic stream).
- [Done] Core APIs avoid unbounded list queries.
- [Done] Admin audit log endpoints support pagination/filtering.
- [Must do before go-live] Capture production-baseline API latency SLO report.

## D) Reliability Readiness
- [Done] Error states are explicit for context/device/auth/policy failures.
- [Done] Failed login retries are bounded by rate limit.
- [Done] Expired context recovery path is defined (restart from store select).
- [Done] Invalid device recovery path is defined (register/approve device).
- [Done] Order/payment consistency uses transactional server flow.
- [Done] Backup and restore runbooks are documented.
- [Done] Rollback/incident runbook is documented.
- [Must do before go-live] Run staging restore + rollback drills and record results.

## E) Operations Readiness
- [Done] GitHub CI workflow exists and runs checks.
- [Done] Branch protection strategy is documented.
- [Done] Vercel preview/production separation is documented.
- [Done] Supabase staging/production migration flow is documented.
- [Done] Migration runbook exists.
- [Done] Monitoring and alerting runbook exists.
- [Done] Incident runbook exists.
- [Must do before go-live] Verify live alert routes and on-call ownership.

## Final 100% Completion Rule
The system is 100% complete only when:
1. Every item marked `Must do before go-live` is completed with timestamped evidence.
2. Manual QA checklist passes without Sev-1/Sev-2 defects.
3. `typecheck`, `lint`, and production build all pass on the release commit.
4. Security and operations signoff is recorded by engineering and operations owners.
