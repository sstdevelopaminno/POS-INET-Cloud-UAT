-- Phase 1 Mobile QR foundation:
-- Activation enrollment + mobile login session scaffolding

alter table if exists branch_login_policies
  add column if not exists allow_mobile_qr_login boolean not null default false,
  add column if not exists require_mobile_device_enrollment boolean not null default true,
  add column if not exists allow_mobile_slip_scan boolean not null default false;

create table if not exists activation_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  token_hash text not null,
  token_type text not null,
  purpose text not null,
  status text not null default 'active',
  requested_by uuid references users_profiles(id) on delete set null,
  approved_by uuid references users_profiles(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activation_tokens_token_type_check check (token_type in ('pos_terminal', 'mobile_scanner', 'admin_enrollment')),
  constraint activation_tokens_purpose_check check (purpose in ('device_activation', 'mobile_login_activation', 'admin_bootstrap')),
  constraint activation_tokens_status_check check (status in ('active', 'consumed', 'expired', 'revoked'))
);

create table if not exists device_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  device_code text not null,
  device_type text not null,
  enrollment_status text not null default 'pending',
  trust_level text not null default 'untrusted',
  activation_token_id uuid references activation_tokens(id) on delete set null,
  enrolled_by uuid references users_profiles(id) on delete set null,
  approved_by uuid references users_profiles(id) on delete set null,
  approved_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_enrollments_device_type_check check (device_type in ('pos_terminal', 'mobile_scanner', 'manager_phone', 'owner_phone', 'staff_phone')),
  constraint device_enrollments_status_check check (enrollment_status in ('pending', 'active', 'revoked', 'blocked')),
  constraint device_enrollments_trust_level_check check (trust_level in ('untrusted', 'enrolled', 'trusted')),
  constraint device_enrollments_branch_scope_check check ((device_type = 'owner_phone') or branch_id is not null)
);

create table if not exists mobile_device_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  device_enrollment_id uuid not null references device_enrollments(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_device_sessions_status_check check (status in ('active', 'expired', 'revoked'))
);

alter table if exists activation_tokens
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists consumed_at timestamptz,
  add column if not exists approved_by uuid references users_profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists device_enrollments
  add column if not exists trust_level text not null default 'untrusted',
  add column if not exists last_seen_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists mobile_device_sessions
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_activation_tokens_token_hash on activation_tokens(token_hash);
create index if not exists idx_activation_tokens_scope_status on activation_tokens(tenant_id, branch_id, status, expires_at);
create index if not exists idx_activation_tokens_expires on activation_tokens(status, expires_at);

create unique index if not exists uq_device_enrollments_tenant_device_code on device_enrollments(tenant_id, device_code);
create index if not exists idx_device_enrollments_scope on device_enrollments(tenant_id, branch_id, enrollment_status);
create index if not exists idx_device_enrollments_lookup on device_enrollments(tenant_id, device_type, trust_level, enrollment_status);

create index if not exists idx_mobile_device_sessions_scope on mobile_device_sessions(tenant_id, branch_id, status, issued_at desc);
create index if not exists idx_mobile_device_sessions_enrollment on mobile_device_sessions(device_enrollment_id, status, issued_at desc);
create index if not exists idx_mobile_device_sessions_user on mobile_device_sessions(user_id, status, issued_at desc);
create unique index if not exists uq_mobile_device_sessions_active_enrollment
  on mobile_device_sessions(device_enrollment_id)
  where status = 'active';

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_activation_tokens_touch'
      and tgrelid = 'public.activation_tokens'::regclass
  ) then
    create trigger trg_activation_tokens_touch
    before update on activation_tokens
    for each row execute function app.touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_device_enrollments_touch'
      and tgrelid = 'public.device_enrollments'::regclass
  ) then
    create trigger trg_device_enrollments_touch
    before update on device_enrollments
    for each row execute function app.touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_mobile_device_sessions_touch'
      and tgrelid = 'public.mobile_device_sessions'::regclass
  ) then
    create trigger trg_mobile_device_sessions_touch
    before update on mobile_device_sessions
    for each row execute function app.touch_updated_at();
  end if;
end $$;

alter table activation_tokens enable row level security;
alter table device_enrollments enable row level security;
alter table mobile_device_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activation_tokens'
      and policyname = 'activation_tokens_select'
  ) then
    create policy activation_tokens_select
    on activation_tokens
    for select
    using (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activation_tokens'
      and policyname = 'activation_tokens_insert'
  ) then
    create policy activation_tokens_insert
    on activation_tokens
    for insert
    with check (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activation_tokens'
      and policyname = 'activation_tokens_update'
  ) then
    create policy activation_tokens_update
    on activation_tokens
    for update
    using (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    )
    with check (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_enrollments'
      and policyname = 'device_enrollments_select'
  ) then
    create policy device_enrollments_select
    on device_enrollments
    for select
    using (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
      or (
        branch_id is not null
        and app.has_branch_access(tenant_id, branch_id)
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_enrollments'
      and policyname = 'device_enrollments_insert'
  ) then
    create policy device_enrollments_insert
    on device_enrollments
    for insert
    with check (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_enrollments'
      and policyname = 'device_enrollments_update'
  ) then
    create policy device_enrollments_update
    on device_enrollments
    for update
    using (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    )
    with check (
      app.is_it_admin()
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_device_sessions'
      and policyname = 'mobile_device_sessions_select'
  ) then
    create policy mobile_device_sessions_select
    on mobile_device_sessions
    for select
    using (
      app.is_it_admin()
      or auth.uid() = user_id
      or (
        branch_id is not null
        and app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_device_sessions'
      and policyname = 'mobile_device_sessions_insert'
  ) then
    create policy mobile_device_sessions_insert
    on mobile_device_sessions
    for insert
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_device_sessions'
      and policyname = 'mobile_device_sessions_update'
  ) then
    create policy mobile_device_sessions_update
    on mobile_device_sessions
    for update
    using (app.is_it_admin())
    with check (app.is_it_admin());
  end if;
end $$;

insert into package_feature_catalog (
  code,
  name,
  description,
  default_monthly_price,
  default_yearly_price,
  default_perpetual_price,
  included_by_default,
  priced_per_branch,
  is_active
)
values
  ('mobile_qr_login', 'Mobile QR Login', 'Allow mobile-based QR login workflows with enrollment controls', 0, 0, 0, false, true, true),
  ('mobile_device_enrollment', 'Mobile Device Enrollment', 'Allow activation token and mobile device enrollment workflows', 0, 0, 0, false, true, true),
  ('mobile_slip_scan', 'Mobile Slip Scan', 'Allow mobile camera/slip scan workflows (separate from login QR)', 0, 0, 0, false, true, true)
on conflict (code) do nothing;

