-- POS Sales MVP scope normalization (reuse existing tables, add missing fields).

alter table if exists products
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists orders
  add column if not exists device_code text,
  add column if not exists cashier_user_id uuid references users_profiles(id),
  add column if not exists pos_session_id uuid references pos_sessions(id) on delete set null,
  add column if not exists grand_total numeric(12,2) not null default 0,
  add column if not exists tax_total numeric(12,2) not null default 0,
  add column if not exists paid_total numeric(12,2) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists order_items
  add column if not exists name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists payments
  add column if not exists shift_id uuid references shifts(id) on delete set null,
  add column if not exists pos_session_id uuid references pos_sessions(id) on delete set null,
  add column if not exists status text not null default 'paid',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update orders
set
  cashier_user_id = coalesce(cashier_user_id, created_by),
  grand_total = coalesce(grand_total, total_amount, 0),
  paid_total = coalesce(paid_total, 0),
  metadata = coalesce(metadata, '{}'::jsonb)
where true;

update order_items oi
set
  name = coalesce(oi.name, p.name),
  metadata = coalesce(oi.metadata, '{}'::jsonb)
from products p
where oi.name is null
  and oi.product_id = p.id;

update order_items
set
  name = coalesce(name, 'Unknown Item'),
  metadata = coalesce(metadata, '{}'::jsonb)
where true;

update payments p
set
  shift_id = coalesce(p.shift_id, o.shift_id),
  pos_session_id = coalesce(p.pos_session_id, o.pos_session_id),
  status = coalesce(p.status, 'paid'),
  metadata = coalesce(p.metadata, '{}'::jsonb)
from orders o
where p.order_id = o.id;

create index if not exists idx_products_scope_active_created
  on products(tenant_id, branch_id, is_active, created_at desc);

create index if not exists idx_orders_scope_shift_created
  on orders(tenant_id, branch_id, shift_id, created_at desc);

create index if not exists idx_orders_pos_session
  on orders(pos_session_id, created_at desc);

create index if not exists idx_orders_cashier
  on orders(cashier_user_id, created_at desc);

create index if not exists idx_orders_device_code
  on orders(device_code, created_at desc);

create index if not exists idx_order_items_order
  on order_items(order_id, created_at asc);

create index if not exists idx_payments_scope_shift_created
  on payments(tenant_id, branch_id, shift_id, created_at desc);

create index if not exists idx_payments_order
  on payments(order_id, created_at desc);

create index if not exists idx_payments_pos_session
  on payments(pos_session_id, created_at desc);

alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_pos_scope_select'
  ) then
    create policy products_pos_scope_select
    on products
    for select
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_pos_scope_select'
  ) then
    create policy orders_pos_scope_select
    on orders
    for select
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_pos_scope_select'
  ) then
    create policy order_items_pos_scope_select
    on order_items
    for select
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_pos_scope_select'
  ) then
    create policy payments_pos_scope_select
    on payments
    for select
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_orders_touch'
      and tgrelid = 'public.orders'::regclass
  ) then
    create trigger trg_orders_touch
    before update on orders
    for each row execute function app.touch_updated_at();
  end if;
end $$;
