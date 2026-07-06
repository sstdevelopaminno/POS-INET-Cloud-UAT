create table if not exists pos_customer_display_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  channel text not null default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, channel)
);

create index if not exists idx_pos_customer_display_states_scope
on pos_customer_display_states(tenant_id, branch_id, channel, updated_at desc);

create trigger trg_pos_customer_display_states_touch
before update on pos_customer_display_states
for each row execute function app.touch_updated_at();

alter table pos_customer_display_states enable row level security;

create policy pos_customer_display_states_select
on pos_customer_display_states
for select
using (app.has_branch_access(tenant_id, branch_id));

create policy pos_customer_display_states_write
on pos_customer_display_states
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
