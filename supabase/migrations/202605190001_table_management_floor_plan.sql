-- Table management + floor plan foundation

alter type approval_action add value if not exists 'table_move_bill';

create table if not exists table_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  zone_name text not null,
  color text not null default '#0ea5e9',
  display_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, zone_name)
);

create table if not exists dining_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  zone_id uuid references table_zones(id) on delete set null,
  table_code text not null,
  table_name text,
  capacity integer not null default 4 check (capacity > 0),
  status text not null default 'available' check (status in ('available', 'occupied', 'ordering', 'pending_payment', 'reserved', 'disabled')),
  shape text not null default 'rectangle' check (shape in ('square', 'rectangle', 'circle')),
  position_x numeric(10,2) not null default 0,
  position_y numeric(10,2) not null default 0,
  width numeric(10,2) not null default 96,
  height numeric(10,2) not null default 72,
  rotation numeric(10,2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, table_code)
);

create table if not exists table_bill_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  table_id uuid not null references dining_tables(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  opened_by uuid not null references users_profiles(id),
  closed_by uuid references users_profiles(id),
  status text not null default 'open' check (status in ('open', 'ordering', 'pending_payment', 'closed', 'cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_table_bill_sessions_table_active
  on table_bill_sessions(table_id)
  where status in ('open', 'ordering', 'pending_payment');

create index if not exists idx_table_zones_tenant_branch_order
  on table_zones(tenant_id, branch_id, display_order, created_at);

create index if not exists idx_dining_tables_tenant_branch_zone_code
  on dining_tables(tenant_id, branch_id, zone_id, table_code);

create index if not exists idx_table_bill_sessions_tenant_branch_status
  on table_bill_sessions(tenant_id, branch_id, status, opened_at desc);

insert into dining_tables (
  id,
  tenant_id,
  branch_id,
  table_code,
  table_name,
  capacity,
  status,
  shape,
  is_active
)
select
  id,
  tenant_id,
  branch_id,
  table_code,
  table_code,
  seats,
  case when is_active then 'available' else 'disabled' end,
  'rectangle',
  is_active
from dine_in_tables
on conflict (tenant_id, branch_id, table_code) do nothing;

alter table if exists orders
  drop constraint if exists orders_table_id_fkey;

alter table if exists orders
  add constraint orders_table_id_fkey
  foreign key (table_id) references dining_tables(id);

alter table if exists table_zones enable row level security;
alter table if exists dining_tables enable row level security;
alter table if exists table_bill_sessions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'table_zones'
      and policyname = 'table_zones_isolation'
  ) then
    create policy table_zones_isolation
    on table_zones
    for all
    using (app.has_branch_access(tenant_id, branch_id))
    with check (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dining_tables'
      and policyname = 'dining_tables_isolation'
  ) then
    create policy dining_tables_isolation
    on dining_tables
    for all
    using (app.has_branch_access(tenant_id, branch_id))
    with check (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'table_bill_sessions'
      and policyname = 'table_bill_sessions_isolation'
  ) then
    create policy table_bill_sessions_isolation
    on table_bill_sessions
    for all
    using (app.has_branch_access(tenant_id, branch_id))
    with check (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

drop trigger if exists trg_table_zones_touch on table_zones;
create trigger trg_table_zones_touch before update on table_zones for each row execute function app.touch_updated_at();

drop trigger if exists trg_dining_tables_touch on dining_tables;
create trigger trg_dining_tables_touch before update on dining_tables for each row execute function app.touch_updated_at();

drop trigger if exists trg_table_bill_sessions_touch on table_bill_sessions;
create trigger trg_table_bill_sessions_touch before update on table_bill_sessions for each row execute function app.touch_updated_at();
