-- POS user-to-device scope per tenant/branch.
-- Supports manager assignment rules:
-- - all_devices: user can use any active device in branch
-- - single_device: user can use only one assigned device

create table if not exists pos_user_device_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  scope_mode text not null default 'all_devices' check (scope_mode in ('all_devices', 'single_device')),
  device_id uuid references branch_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, user_id)
);

create index if not exists idx_pos_user_device_scopes_scope
  on pos_user_device_scopes(tenant_id, branch_id, user_id, scope_mode);

create index if not exists idx_pos_user_device_scopes_device
  on pos_user_device_scopes(tenant_id, branch_id, device_id);

create trigger trg_pos_user_device_scopes_touch
before update on pos_user_device_scopes
for each row execute function app.touch_updated_at();

alter table pos_user_device_scopes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_user_device_scopes'
      and policyname = 'pos_user_device_scopes_select'
  ) then
    create policy pos_user_device_scopes_select
    on pos_user_device_scopes
    for select
    using (app.has_tenant_access(tenant_id));
  end if;
end $$;

