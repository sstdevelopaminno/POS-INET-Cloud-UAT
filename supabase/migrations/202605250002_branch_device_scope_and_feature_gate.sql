-- Branch scope/device login foundation + feature gate helpers

create table if not exists branch_login_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  require_qr_login boolean not null default true,
  allow_slip_capture boolean not null default true,
  max_devices integer not null default 1 check (max_devices >= 1),
  allow_shared_devices boolean not null default false,
  enforce_shift_checkin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id)
);

create table if not exists branch_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  device_code text not null,
  device_name text not null,
  device_type text not null default 'pos_terminal' check (device_type in ('pos_terminal', 'mobile_scanner', 'kiosk')),
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),
  is_locked boolean not null default true,
  allow_morning_shift boolean not null default true,
  allow_afternoon_shift boolean not null default true,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, device_code)
);

create table if not exists branch_device_shift_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  device_id uuid references branch_devices(id) on delete set null,
  user_id uuid not null references users_profiles(id) on delete cascade,
  session_mode text not null default 'qr' check (session_mode in ('qr', 'manual')),
  shift_code text not null default 'morning' check (shift_code in ('morning', 'afternoon', 'custom')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_branch_login_policies_scope on branch_login_policies(tenant_id, branch_id);
create index if not exists idx_branch_devices_scope on branch_devices(tenant_id, branch_id, status);
create index if not exists idx_branch_sessions_scope on branch_device_shift_sessions(tenant_id, branch_id, status, started_at desc);
create index if not exists idx_branch_sessions_user on branch_device_shift_sessions(user_id, status, started_at desc);

create trigger trg_branch_login_policies_touch before update on branch_login_policies for each row execute function app.touch_updated_at();
create trigger trg_branch_devices_touch before update on branch_devices for each row execute function app.touch_updated_at();
create trigger trg_branch_device_shift_sessions_touch before update on branch_device_shift_sessions for each row execute function app.touch_updated_at();

alter table branch_login_policies enable row level security;
alter table branch_devices enable row level security;
alter table branch_device_shift_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_login_policies' and policyname = 'branch_login_policies_select') then
    create policy branch_login_policies_select
    on branch_login_policies
    for select
    using (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_login_policies' and policyname = 'branch_login_policies_manage') then
    create policy branch_login_policies_manage
    on branch_login_policies
    for all
    using (app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[]) or app.is_it_admin())
    with check (app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[]) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_devices' and policyname = 'branch_devices_select') then
    create policy branch_devices_select
    on branch_devices
    for select
    using (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_devices' and policyname = 'branch_devices_manage') then
    create policy branch_devices_manage
    on branch_devices
    for all
    using (app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[]) or app.is_it_admin())
    with check (app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[]) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_device_shift_sessions' and policyname = 'branch_device_shift_sessions_select') then
    create policy branch_device_shift_sessions_select
    on branch_device_shift_sessions
    for select
    using (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_device_shift_sessions' and policyname = 'branch_device_shift_sessions_manage') then
    create policy branch_device_shift_sessions_manage
    on branch_device_shift_sessions
    for all
    using (app.has_branch_access(tenant_id, branch_id))
    with check (app.has_branch_access(tenant_id, branch_id));
  end if;
end $$;

create or replace function app.tenant_has_feature(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_feature_code text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with active_contract as (
    select c.package_id
    from tenant_subscription_contracts c
    where c.tenant_id = p_tenant_id
      and c.status = 'active'
    order by c.created_at desc
    limit 1
  ),
  package_feature as (
    select spf.feature_code
    from subscription_package_features spf
    join active_contract ac on ac.package_id = spf.package_id
    where spf.feature_code = p_feature_code
      and spf.included = true
  ),
  addon_feature as (
    select tfs.feature_code
    from tenant_feature_subscriptions tfs
    where tfs.tenant_id = p_tenant_id
      and (tfs.branch_id is null or tfs.branch_id = p_branch_id)
      and tfs.feature_code = p_feature_code
      and tfs.is_enabled = true
  )
  select exists (select 1 from package_feature) or exists (select 1 from addon_feature);
$$;

revoke all on function app.tenant_has_feature(uuid, uuid, text) from public;
grant execute on function app.tenant_has_feature(uuid, uuid, text) to authenticated;
