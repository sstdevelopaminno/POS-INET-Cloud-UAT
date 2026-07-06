# Audit Log Architecture (Hardening v0.1.1)

## Purpose

This document defines the production audit logging architecture for POS Preview.
The goal is to persist important actions with tenant isolation context and enough
forensic detail for operational review, incident response, and compliance.

## Scope

Audit logging is used for privileged and sensitive actions, including:

- PIN approval attempts and approvals
- Shift close blocking/override and close completion
- Stock adjustment actions
- Manual delivery order creation
- IT Admin tenant management actions

## Storage Model

Table: `audit_logs` (Supabase/Postgres)

Required fields now supported:

- `tenant_id`
- `branch_id`
- `user_id`
- `role`
- `action`
- `module`
- `entity_type`
- `entity_id`
- `before_data`
- `after_data`
- `override_by_user_id`
- `ip_address`
- `user_agent`
- `created_at`

Backward compatibility fields retained:

- `actor_user_id`
- `actor_role`
- `target_table`
- `target_id`
- `metadata`

## Write Path

Application helper: `apps/backoffice-web/src/lib/audit-log.ts`

1. Business/API layer calls `appendAuditLog(...)`
2. Helper normalizes payload into audit row format
3. Insert is executed via Supabase service-role client (server-only)
4. Result is returned to caller as `inserted: true|false`

## Failure Handling Policy

Audit write failures must **not crash business flows**.

- `appendAuditLog` catches insert errors
- logs a sanitized server error (`console.error`) with non-secret context
- returns `{ inserted: false, error: "audit_log_write_failed" }`
- caller flow continues

This ensures system availability while preserving observability of logging failures.

## Security Boundary

- Service role key remains server-only (`supabase-admin.ts` imports `server-only`)
- No service key usage in client components
- Production env secret remains in Vercel encrypted env vars

## Multi-tenant Considerations

- `tenant_id` and `branch_id` are persisted with each log where applicable
- Existing RLS model continues to isolate tenant/branch reads for authenticated access
- IT Admin reads remain governed by platform-level access policy

## Field Mapping Rules

- `module`: inferred from target table when not explicitly supplied
  - `orders/order_items/payments` -> `pos_sales`
  - `stock_movements/ingredients/recipes` -> `stock`
  - `shifts` -> `shift`
  - `users_profiles/user_branch_roles` -> `staff`
  - `tenants/subscription_packages/tenant_billing_cycles` -> `it_admin`
  - fallback -> first token in `action`, else `general`
- `entity_type`: defaults to `targetTable`
- `entity_id`: defaults to `targetId`
- `before_data`: from explicit `beforeData` or `metadata.before_data`
- `after_data`: from explicit `afterData` or `metadata.after_data`

## Testing

Integration tests added:

- `apps/backoffice-web/tests/integration/audit-log.integration.test.ts`
  - verifies insert payload mapping for required fields
  - verifies safe-fail behavior (no throw when insert fails)

## Operational Notes

- Audit insert errors should be monitored in server logs.
- Future phase can route errors to structured observability pipeline (drain/SIEM).
- Future phase can include request-level correlation IDs and trace IDs in audit metadata.
