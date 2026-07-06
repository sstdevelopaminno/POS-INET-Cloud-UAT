-- Core schema for multi-tenant POS platform
create extension if not exists pgcrypto;

create schema if not exists app;

create type platform_role as enum ('it_admin', 'tenant_user');
create type branch_role as enum ('owner', 'manager', 'staff');
create type order_type as enum ('dine_in', 'takeaway', 'delivery_manual');
create type order_status as enum ('draft', 'queued', 'preparing', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'bank_transfer');
create type shift_status as enum ('open', 'closed');
create type stock_movement_type as enum ('purchase', 'sale_deduction', 'manual_adjustment', 'waste');
create type approval_action as enum ('cancel_bill', 'stock_adjustment', 'employee_delete', 'shift_close_override');
create type delivery_status as enum ('pending', 'preparing', 'completed', 'cancelled');

create table if not exists subscription_packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price numeric(12,2) not null,
  max_branches integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  owner_name text,
  owner_phone text,
  package_id uuid references subscription_packages(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists users_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  platform_role platform_role not null default 'tenant_user',
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_branch_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profiles(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  role branch_role not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, branch_id)
);

create table if not exists dine_in_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  table_code text not null,
  seats integer not null default 4,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, branch_id, table_code)
);

create table if not exists merchant_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  channel_code text not null,
  channel_name text not null,
  is_manual boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, branch_id, channel_code)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null,
  price numeric(12,2) not null,
  is_combo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, sku)
);

create table if not exists product_combo_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  combo_product_id uuid not null references products(id) on delete cascade,
  child_product_id uuid not null references products(id) on delete cascade,
  qty numeric(12,3) not null,
  created_at timestamptz not null default now(),
  unique (combo_product_id, child_product_id)
);

create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  base_unit text not null,
  quantity_on_hand numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, name)
);

create table if not exists ingredient_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  package_name text not null,
  unit_count numeric(14,3) not null,
  created_at timestamptz not null default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity_per_item numeric(14,3) not null,
  applies_when_takeaway_only boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, ingredient_id, applies_when_takeaway_only)
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  opened_by uuid not null references users_profiles(id),
  closed_by uuid references users_profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) not null,
  expected_cash numeric(12,2),
  actual_cash numeric(12,2),
  close_override_approval_id uuid,
  status shift_status not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete restrict,
  order_no text not null,
  order_type order_type not null,
  channel text not null,
  delivery_status delivery_status,
  table_id uuid references dine_in_tables(id),
  external_order_code text,
  customer_name text,
  notes text,
  subtotal numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  gp_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  status order_status not null default 'draft',
  cancellation_approval_id uuid,
  cancelled_by uuid references users_profiles(id),
  cancelled_reason text,
  created_by uuid not null references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, order_no)
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  method payment_method not null,
  amount numeric(12,2) not null,
  reference_no text,
  received_by uuid not null references users_profiles(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  movement_type stock_movement_type not null,
  quantity_delta numeric(14,3) not null,
  reason text not null,
  ref_table text,
  ref_id uuid,
  approval_id uuid,
  created_by uuid not null references users_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists manager_pin_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  action approval_action not null,
  requested_by uuid not null references users_profiles(id),
  approved_by uuid not null references users_profiles(id),
  target_table text not null,
  target_id uuid not null,
  note text,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  actor_user_id uuid not null references users_profiles(id),
  actor_role text not null,
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tenant_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  package_id uuid not null references subscription_packages(id),
  period_start date not null,
  period_end date not null,
  amount_due numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now()
);

create index if not exists idx_branch_roles_user on user_branch_roles(user_id, tenant_id, branch_id);
create index if not exists idx_orders_tenant_branch_created on orders(tenant_id, branch_id, created_at desc);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_payments_order on payments(order_id);
create index if not exists idx_stock_movements_ingredient on stock_movements(tenant_id, branch_id, ingredient_id, created_at desc);
create index if not exists idx_audit_logs_tenant_branch_created on audit_logs(tenant_id, branch_id, created_at desc);

create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_touch before update on tenants for each row execute function app.touch_updated_at();
create trigger trg_branches_touch before update on branches for each row execute function app.touch_updated_at();
create trigger trg_products_touch before update on products for each row execute function app.touch_updated_at();
create trigger trg_ingredients_touch before update on ingredients for each row execute function app.touch_updated_at();
create trigger trg_orders_touch before update on orders for each row execute function app.touch_updated_at();
create trigger trg_users_profiles_touch before update on users_profiles for each row execute function app.touch_updated_at();

create or replace function app.consume_ingredient(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_order_type order_type,
  p_created_by uuid,
  p_order_id uuid
) returns void language plpgsql as $$
declare
  rec record;
  use_qty numeric;
begin
  for rec in
    select ingredient_id, quantity_per_item, applies_when_takeaway_only
    from recipes
    where tenant_id = p_tenant_id and branch_id = p_branch_id and product_id = p_product_id
  loop
    if rec.applies_when_takeaway_only and p_order_type <> 'takeaway' and p_order_type <> 'delivery_manual' then
      continue;
    end if;

    use_qty := rec.quantity_per_item * p_qty;

    update ingredients
    set quantity_on_hand = quantity_on_hand - use_qty
    where id = rec.ingredient_id and tenant_id = p_tenant_id and branch_id = p_branch_id;

    insert into stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      movement_type,
      quantity_delta,
      reason,
      ref_table,
      ref_id,
      created_by
    )
    values (
      p_tenant_id,
      p_branch_id,
      rec.ingredient_id,
      'sale_deduction',
      -use_qty,
      'Auto deduction from recipe',
      'orders',
      p_order_id,
      p_created_by
    );
  end loop;
end;
$$;

create or replace function app.enforce_order_cancellation_approval() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if new.cancellation_approval_id is null then
      raise exception 'Cancellation requires manager or owner approval.';
    end if;

    if not exists (
      select 1
      from manager_pin_approvals a
      where a.id = new.cancellation_approval_id
        and a.action = 'cancel_bill'
        and a.target_table = 'orders'
        and a.target_id = new.id
        and a.expires_at > now()
    ) then
      raise exception 'Cancellation approval is invalid or expired.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_orders_cancel_approval
before update on orders
for each row
execute function app.enforce_order_cancellation_approval();

create or replace function app.enforce_shift_close_rules() returns trigger language plpgsql as $$
declare
  unpaid_count integer;
  mismatch boolean;
begin
  if new.status = 'closed' and old.status <> 'closed' then
    select count(*) into unpaid_count
    from orders o
    where o.shift_id = new.id
      and o.order_type = 'dine_in'
      and o.status <> 'completed'
      and o.status <> 'cancelled';

    mismatch := coalesce(new.expected_cash, 0) <> coalesce(new.actual_cash, 0);

    if (unpaid_count > 0 or mismatch) then
      if new.close_override_approval_id is null then
        raise exception 'Manager/owner override is required to close shift.';
      end if;

      if not exists (
        select 1
        from manager_pin_approvals a
        where a.id = new.close_override_approval_id
          and a.action = 'shift_close_override'
          and a.target_table = 'shifts'
          and a.target_id = new.id
          and a.expires_at > now()
      ) then
        raise exception 'Shift close override approval is invalid or expired.';
      end if;
    end if;

    new.closed_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_shifts_close_guard
before update on shifts
for each row
execute function app.enforce_shift_close_rules();

create or replace function app.enforce_approval_approver_role() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
    from user_branch_roles ubr
    where ubr.user_id = new.approved_by
      and ubr.tenant_id = new.tenant_id
      and ubr.branch_id = new.branch_id
      and ubr.role in ('manager', 'owner')
  ) then
    raise exception 'Approver must be manager or owner in the same branch.';
  end if;

  return new;
end;
$$;

create trigger trg_manager_pin_approval_guard
before insert or update on manager_pin_approvals
for each row
execute function app.enforce_approval_approver_role();

create or replace function app.enforce_stock_adjustment_approval() returns trigger language plpgsql as $$
begin
  if new.movement_type = 'manual_adjustment' then
    if new.approval_id is null then
      raise exception 'Manual stock adjustment requires approval.';
    end if;

    if not exists (
      select 1
      from manager_pin_approvals a
      where a.id = new.approval_id
        and a.action = 'stock_adjustment'
        and a.target_table = 'stock_movements'
        and a.target_id = new.id
        and a.expires_at > now()
    ) then
      raise exception 'Stock adjustment approval is invalid or expired.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_stock_adjustment_guard
before insert on stock_movements
for each row
execute function app.enforce_stock_adjustment_approval();
