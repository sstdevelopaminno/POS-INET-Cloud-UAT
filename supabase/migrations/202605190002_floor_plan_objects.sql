-- Floor plan movable objects for table management canvas

create table if not exists table_layout_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  zone_id uuid references table_zones(id) on delete set null,
  object_type text not null check (object_type in ('counter', 'cashier', 'partition', 'plant', 'entrance', 'service_station')),
  object_name text,
  color text not null default '#334155',
  position_x numeric(10,2) not null default 0,
  position_y numeric(10,2) not null default 0,
  width numeric(10,2) not null default 120,
  height numeric(10,2) not null default 60,
  rotation numeric(10,2) not null default 0,
  z_index integer not null default 1,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_table_layout_objects_tenant_branch_zone
  on table_layout_objects(tenant_id, branch_id, zone_id, z_index, created_at);

alter table if exists table_layout_objects enable row level security;

drop policy if exists table_layout_objects_isolation on table_layout_objects;
create policy table_layout_objects_isolation
on table_layout_objects
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));

drop trigger if exists trg_table_layout_objects_touch on table_layout_objects;
create trigger trg_table_layout_objects_touch before update on table_layout_objects for each row execute function app.touch_updated_at();
