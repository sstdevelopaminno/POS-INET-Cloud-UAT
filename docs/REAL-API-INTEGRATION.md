# Real API Integration (v0.1.2)

Date: 2026-05-18

## Objective
Replace preview/mock module pages with stable Supabase-backed API integrations while preserving transaction safety and access controls.

Scope in this phase:
- orders
- stock
- shifts
- audit logs
- staff management

Out of scope in this phase:
- realtime subscriptions
- offline mode

## Architecture

### API Layer (Backoffice)
All module pages now read from real API routes under `/api/backoffice/*`.

New/updated endpoints:
- `GET /api/backoffice/orders`
- `POST /api/backoffice/orders` (already transaction-safe from v0.1.1)
- `GET /api/backoffice/stock`
- `POST /api/backoffice/stock/adjust` (transaction-safe from v0.1.1)
- `GET /api/backoffice/shifts`
- `POST /api/backoffice/shifts`
- `POST /api/backoffice/shifts/close` (now uses real order query + DB update)
- `GET /api/backoffice/audit-logs`
- `GET /api/backoffice/staff`
- `PATCH /api/backoffice/staff`

### Frontend Integration
Backoffice module pages now use client-side API fetching with a shared hook:
- `usePaginatedApi()` for loading/error/data flow
- per-page controls for filter/search/pagination
- explicit loading/error/empty states
- table wrapper with horizontal scroll for smaller screens

## State Handling Requirements
Implemented for each integrated module:
- Loading state
- Error state
- Empty state
- Pagination controls
- Filtering controls
- Search input

## Access and Isolation Guarantees

### Tenant isolation
Every query is constrained by authenticated claims:
- `tenant_id = auth.tenantId`
- `branch_id = auth.branchId`

### Branch filtering
API supports optional `branch_id` query input.
If provided and not equal to claim branch, request is rejected with `403 forbidden_branch_scope`.

### Role enforcement
- Staff management (`/api/backoffice/staff`) is restricted to `manager` or `owner`.
- Audit logs (`/api/backoffice/audit-logs`) are restricted to `manager` or `owner`.

## Transaction Safety Compatibility
v0.1.1 transaction-safe flows are preserved:
- Order creation still uses SQL transaction RPC with recipe deduction and rollback safety.
- Stock adjustment still uses SQL transaction RPC with idempotency support.

## Test Coverage Added
Integration tests added for real API usage behavior:
- `tests/integration/orders-api.integration.test.ts`
- `tests/integration/staff-audit-api.integration.test.ts`
- `tests/integration/shifts-api.integration.test.ts`

Coverage focus:
- pagination/filter/search API behaviors
- tenant/branch query constraints
- role-based access enforcement
- shift close route using real DB access path

## Validation Results
- `pnpm test` -> pass
- `pnpm build` -> pass

## Notes
- This phase focuses on stable CRUD/list flows over server APIs.
- Realtime stream updates and offline queue sync are intentionally deferred.
