# RLS Policy Plan

## Access model
- Authenticated user identity: `auth.uid()`.
- IT admin global access: `users_profiles.platform_role='it_admin'`.
- Tenant/branch access: `user_branch_roles` mapping.

## Helper SQL functions
- `app.current_user_id()`
- `app.is_it_admin()`
- `app.has_tenant_access(tenant_id)`
- `app.has_branch_access(tenant_id, branch_id)`
- `app.has_role(tenant_id, branch_id, allowed_roles[])`

## Policy strategy
- `tenants`, `branches`: isolated by membership, IT admin full control.
- All branch-scoped business tables: `USING/WITH CHECK app.has_branch_access(tenant_id, branch_id)`.
- `audit_logs`: tenant users can read only own tenant+branch logs; IT admin can read platform-wide logs.
- `tenant_billing_cycles`: IT admin write, owner/IT admin read.

## Sensitive action enforcement
RLS limits row scope, while triggers enforce rule semantics:
- `trg_orders_cancel_approval`
- `trg_stock_adjustment_guard`
- `trg_shifts_close_guard`

## Notes
- PIN verification itself should happen in application logic.
- Persist every approval and final action in `audit_logs`.

