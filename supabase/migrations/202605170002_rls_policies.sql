-- RLS and tenant isolation policy plan
alter table subscription_packages enable row level security;
alter table tenants enable row level security;
alter table branches enable row level security;
alter table users_profiles enable row level security;
alter table user_branch_roles enable row level security;
alter table dine_in_tables enable row level security;
alter table merchant_channels enable row level security;
alter table products enable row level security;
alter table product_combo_items enable row level security;
alter table ingredients enable row level security;
alter table ingredient_packages enable row level security;
alter table recipes enable row level security;
alter table shifts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table stock_movements enable row level security;
alter table manager_pin_approvals enable row level security;
alter table audit_logs enable row level security;
alter table tenant_billing_cycles enable row level security;

create or replace function app.current_user_id() returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function app.is_it_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from users_profiles up
    where up.id = auth.uid()
      and up.platform_role = 'it_admin'
      and up.is_active = true
  );
$$;

create or replace function app.has_branch_access(p_tenant_id uuid, p_branch_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.is_it_admin()
    or exists (
      select 1
      from user_branch_roles ubr
      join users_profiles up on up.id = ubr.user_id
      where ubr.user_id = auth.uid()
        and ubr.tenant_id = p_tenant_id
        and ubr.branch_id = p_branch_id
        and up.is_active = true
    );
$$;

create or replace function app.has_tenant_access(p_tenant_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.is_it_admin()
    or exists (
      select 1
      from user_branch_roles ubr
      where ubr.user_id = auth.uid()
        and ubr.tenant_id = p_tenant_id
    );
$$;

create or replace function app.has_role(p_tenant_id uuid, p_branch_id uuid, allowed_roles branch_role[]) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_branch_roles ubr
    where ubr.user_id = auth.uid()
      and ubr.tenant_id = p_tenant_id
      and ubr.branch_id = p_branch_id
      and ubr.role = any(allowed_roles)
  );
$$;

revoke all on function app.current_user_id() from public;
revoke all on function app.is_it_admin() from public;
revoke all on function app.has_branch_access(uuid, uuid) from public;
revoke all on function app.has_tenant_access(uuid) from public;
revoke all on function app.has_role(uuid, uuid, branch_role[]) from public;
grant execute on function app.current_user_id() to authenticated;
grant execute on function app.is_it_admin() to authenticated;
grant execute on function app.has_branch_access(uuid, uuid) to authenticated;
grant execute on function app.has_tenant_access(uuid) to authenticated;
grant execute on function app.has_role(uuid, uuid, branch_role[]) to authenticated;

create policy subscription_packages_it_admin_read
on subscription_packages
for select
using (app.is_it_admin());

create policy subscription_packages_tenant_read
on subscription_packages
for select
using (
  exists (
    select 1
    from tenants t
    where t.package_id = subscription_packages.id
      and app.has_tenant_access(t.id)
  )
);

create policy tenants_isolation_select
on tenants
for select
using (app.has_tenant_access(id));

create policy tenants_it_admin_manage
on tenants
for all
using (app.is_it_admin())
with check (app.is_it_admin());

create policy branches_tenant_select
on branches
for select
using (app.has_branch_access(tenant_id, id));

create policy branches_owner_manage
on branches
for all
using (app.has_role(tenant_id, id, array['owner']::branch_role[]) or app.is_it_admin())
with check (app.has_role(tenant_id, id, array['owner']::branch_role[]) or app.is_it_admin());

create policy user_profiles_self_or_admin
on users_profiles
for select
using (
  id = auth.uid()
  or app.is_it_admin()
  or exists (
    select 1 from user_branch_roles ubr where ubr.user_id = users_profiles.id and app.has_tenant_access(ubr.tenant_id)
  )
);

create policy user_profiles_self_update
on users_profiles
for update
using (id = auth.uid() or app.is_it_admin())
with check (id = auth.uid() or app.is_it_admin());

create policy user_branch_roles_isolation
on user_branch_roles
for select
using (app.has_branch_access(tenant_id, branch_id));

create policy user_branch_roles_owner_manage
on user_branch_roles
for all
using (app.has_role(tenant_id, branch_id, array['owner']::branch_role[]) or app.is_it_admin())
with check (app.has_role(tenant_id, branch_id, array['owner']::branch_role[]) or app.is_it_admin());

create policy tenant_branch_tables_isolation_dine_in_tables
on dine_in_tables
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_merchant_channels
on merchant_channels
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_products
on products
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_product_combo_items
on product_combo_items
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_ingredients
on ingredients
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_ingredient_packages
on ingredient_packages
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_recipes
on recipes
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_shifts
on shifts
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_orders
on orders
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_order_items
on order_items
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_payments
on payments
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy tenant_branch_tables_isolation_stock_movements
on stock_movements
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

create policy manager_pin_approvals_select
on manager_pin_approvals
for select
using (app.has_branch_access(tenant_id, branch_id));

create policy manager_pin_approvals_insert
on manager_pin_approvals
for insert
with check (
  app.has_branch_access(tenant_id, branch_id)
  and approved_by = auth.uid()
  and app.has_role(tenant_id, branch_id, array['manager', 'owner']::branch_role[])
);

create policy audit_logs_isolation
on audit_logs
for select
using ((tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id)) or app.is_it_admin());

create policy audit_logs_insert
on audit_logs
for insert
with check ((tenant_id is null and app.is_it_admin()) or (tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id)));

create policy billing_cycles_it_admin_manage
on tenant_billing_cycles
for all
using (app.is_it_admin())
with check (app.is_it_admin());

create policy billing_cycles_owner_read
on tenant_billing_cycles
for select
using (
  app.is_it_admin()
  or (
    tenant_id is not null
    and branch_id is not null
    and app.has_role(tenant_id, branch_id, array['owner']::branch_role[])
  )
);
