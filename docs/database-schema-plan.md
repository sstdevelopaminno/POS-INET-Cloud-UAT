# Database Schema Plan

## Goals
- Multi-tenant POS platform for noodle/small restaurant businesses.
- Strict tenant and branch isolation with Supabase RLS.
- Shared data model for Back Office, IT Admin, and Android POS.
- Auditability for all sensitive actions and approvals.

## Core Domains
1. Platform and tenancy
- `subscription_packages`
- `tenants`
- `branches`
- `tenant_billing_cycles`

2. Identity and access
- `users_profiles`
- `user_branch_roles`
- `manager_pin_approvals`

3. Catalog and inventory
- `products`
- `product_combo_items`
- `ingredients`
- `ingredient_packages`
- `recipes`
- `stock_movements`

4. Selling operations
- `dine_in_tables`
- `merchant_channels`
- `shifts`
- `orders`
- `order_items`
- `payments`

5. Governance and observability
- `audit_logs`

## Tenant and branch rules
- Business tables always carry `tenant_id` and `branch_id` where applicable.
- `tenant_id + branch_id` are validated via foreign keys to `tenants` and `branches`.
- RLS only allows rows from memberships in `user_branch_roles`.

## Critical business constraints
- Staff cannot cancel bills directly.
- Bill cancellation requires valid `manager_pin_approvals` row with `action='cancel_bill'`.
- Manual stock adjustment requires approval row with `action='stock_adjustment'`.
- Shift close with unpaid dine-in bills or cash mismatch requires `action='shift_close_override'`.
- Recipe deductions are done via function `app.consume_ingredient` and recorded in `stock_movements`.

## Migration files
- `supabase/migrations/202605170001_init_core.sql`
- `supabase/migrations/202605170002_rls_policies.sql`

## Free-plan consideration
Supabase Free (500MB DB, 1GB storage, limited egress/realtime) is suitable for MVP/sample tenants but not broad production rollout. Keep data partitioning and billing architecture ready for Pro/project split.

