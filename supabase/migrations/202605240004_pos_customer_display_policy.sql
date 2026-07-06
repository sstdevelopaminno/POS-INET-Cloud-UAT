create table if not exists pos_customer_display_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  channel text not null default 'main',
  max_active_devices integer not null default 4 check (max_active_devices between 1 and 64),
  inactive_expire_hours integer not null default 72 check (inactive_expire_hours between 1 and 2160),
  is_active boolean not null default true,
  created_by uuid references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, channel)
);

create index if not exists idx_pos_customer_display_policies_scope
on pos_customer_display_policies(tenant_id, branch_id, channel);

create trigger trg_pos_customer_display_policies_touch
before update on pos_customer_display_policies
for each row execute function app.touch_updated_at();

alter table pos_customer_display_policies enable row level security;

create policy pos_customer_display_policies_select
on pos_customer_display_policies
for select
using (app.has_branch_access(tenant_id, branch_id));

create policy pos_customer_display_policies_write
on pos_customer_display_policies
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
