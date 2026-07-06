-- Table management performance telemetry

create table if not exists table_management_perf_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid references users_profiles(id) on delete set null,
  event_type text not null check (event_type in ('load', 'action', 'api')),
  label text not null,
  duration_ms numeric(10,2) not null check (duration_ms >= 0),
  status_code integer,
  is_ok boolean,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_table_mgmt_perf_tenant_branch_event_at
  on table_management_perf_events(tenant_id, branch_id, event_at desc);

create index if not exists idx_table_mgmt_perf_event_type_label
  on table_management_perf_events(event_type, label);

alter table if exists table_management_perf_events enable row level security;

create policy table_management_perf_events_isolation
on table_management_perf_events
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
