-- POS real authentication/session foundation:
-- - pos_sessions
-- - login_attempts
-- - audit_logs extension for POS login forensics

create table if not exists pos_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  device_id uuid references branch_devices(id) on delete set null,
  device_code text,
  user_id uuid not null references users_profiles(id) on delete restrict,
  role text not null,
  login_context_id uuid not null references pos_login_contexts(id) on delete restrict,
  login_method text not null check (login_method in ('qr', 'pin', 'staff_card')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  shift_id uuid references shifts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  device_code text,
  login_context_id uuid references pos_login_contexts(id) on delete set null,
  user_id uuid references users_profiles(id) on delete set null,
  login_method text,
  success boolean not null default false,
  failure_reason text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- TODO: Temporary QR token table for Prompt 1.
-- Replace with signed challenge/issuer workflow in a later phase.
create table if not exists pos_qr_login_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  qr_token text not null unique,
  status text not null default 'active' check (status in ('active', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- TODO: Temporary staff card mapping for Prompt 1.
-- Replace with hardware-backed card auth in later phase.
create table if not exists pos_staff_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  card_code text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, branch_id, card_code)
);

create index if not exists idx_pos_sessions_scope on pos_sessions(tenant_id, branch_id, issued_at desc);
create index if not exists idx_pos_sessions_login_context on pos_sessions(login_context_id);
create index if not exists idx_pos_sessions_user on pos_sessions(user_id, status, issued_at desc);
create index if not exists idx_pos_sessions_device_code on pos_sessions(device_code);
create index if not exists idx_pos_sessions_device_id on pos_sessions(device_id);

-- Normalize pre-existing active duplicates before enforcing unique partial indexes.
with ranked_login_context as (
  select
    id,
    row_number() over (
      partition by login_context_id
      order by issued_at desc, created_at desc, id desc
    ) as rn
  from pos_sessions
  where status = 'active'
),
duplicate_login_context as (
  select id
  from ranked_login_context
  where rn > 1
)
update pos_sessions ps
set
  status = 'revoked',
  revoked_at = coalesce(ps.revoked_at, now()),
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object('auto_revoked_reason', 'duplicate_active_login_context')
where ps.id in (select id from duplicate_login_context);

with ranked_user_branch as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id, user_id
      order by issued_at desc, created_at desc, id desc
    ) as rn
  from pos_sessions
  where status = 'active'
),
duplicate_user_branch as (
  select id
  from ranked_user_branch
  where rn > 1
)
update pos_sessions ps
set
  status = 'revoked',
  revoked_at = coalesce(ps.revoked_at, now()),
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object('auto_revoked_reason', 'duplicate_active_user_branch')
where ps.id in (select id from duplicate_user_branch);

-- Prevent the same ctx from producing multiple active sessions.
create unique index if not exists uq_pos_sessions_login_context_active
  on pos_sessions(login_context_id)
  where status = 'active';

-- Guardrail against accidental duplicate active sessions for the same user+branch.
create unique index if not exists uq_pos_sessions_user_branch_active
  on pos_sessions(tenant_id, branch_id, user_id)
  where status = 'active';

create index if not exists idx_login_attempts_scope_created on login_attempts(tenant_id, branch_id, created_at desc);
create index if not exists idx_login_attempts_context on login_attempts(login_context_id, created_at desc);
create index if not exists idx_login_attempts_user on login_attempts(user_id, created_at desc);
create index if not exists idx_login_attempts_device_code on login_attempts(device_code, created_at desc);
create index if not exists idx_pos_qr_login_tokens_scope on pos_qr_login_tokens(tenant_id, branch_id, status, expires_at);
create index if not exists idx_pos_qr_login_tokens_user on pos_qr_login_tokens(user_id, status, expires_at);
create index if not exists idx_pos_staff_cards_scope on pos_staff_cards(tenant_id, branch_id, status);
create index if not exists idx_pos_staff_cards_user on pos_staff_cards(user_id, status);

create trigger trg_pos_sessions_touch
before update on pos_sessions
for each row execute function app.touch_updated_at();

alter table pos_sessions enable row level security;
alter table login_attempts enable row level security;
alter table pos_qr_login_tokens enable row level security;
alter table pos_staff_cards enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_sessions'
      and policyname = 'pos_sessions_select'
  ) then
    create policy pos_sessions_select
    on pos_sessions
    for select
    using ((tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id)) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_sessions'
      and policyname = 'pos_sessions_insert'
  ) then
    create policy pos_sessions_insert
    on pos_sessions
    for insert
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_sessions'
      and policyname = 'pos_sessions_update'
  ) then
    create policy pos_sessions_update
    on pos_sessions
    for update
    using (app.is_it_admin())
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'login_attempts'
      and policyname = 'login_attempts_select'
  ) then
    create policy login_attempts_select
    on login_attempts
    for select
    using (
      app.is_it_admin()
      or (tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id))
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'login_attempts'
      and policyname = 'login_attempts_insert'
  ) then
    create policy login_attempts_insert
    on login_attempts
    for insert
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_qr_login_tokens'
      and policyname = 'pos_qr_login_tokens_select'
  ) then
    create policy pos_qr_login_tokens_select
    on pos_qr_login_tokens
    for select
    using (
      app.is_it_admin()
      or (tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id))
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_qr_login_tokens'
      and policyname = 'pos_qr_login_tokens_insert'
  ) then
    create policy pos_qr_login_tokens_insert
    on pos_qr_login_tokens
    for insert
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_qr_login_tokens'
      and policyname = 'pos_qr_login_tokens_update'
  ) then
    create policy pos_qr_login_tokens_update
    on pos_qr_login_tokens
    for update
    using (app.is_it_admin())
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_staff_cards'
      and policyname = 'pos_staff_cards_select'
  ) then
    create policy pos_staff_cards_select
    on pos_staff_cards
    for select
    using (
      app.is_it_admin()
      or (tenant_id is not null and branch_id is not null and app.has_branch_access(tenant_id, branch_id))
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_staff_cards'
      and policyname = 'pos_staff_cards_insert'
  ) then
    create policy pos_staff_cards_insert
    on pos_staff_cards
    for insert
    with check (app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_staff_cards'
      and policyname = 'pos_staff_cards_update'
  ) then
    create policy pos_staff_cards_update
    on pos_staff_cards
    for update
    using (app.is_it_admin())
    with check (app.is_it_admin());
  end if;
end $$;

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  actor_user_id uuid references users_profiles(id),
  target_user_id uuid references users_profiles(id),
  device_code text,
  pos_session_id uuid references pos_sessions(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table if exists audit_logs
  add column if not exists target_user_id uuid references users_profiles(id),
  add column if not exists device_code text,
  add column if not exists pos_session_id uuid references pos_sessions(id) on delete set null,
  add column if not exists target_type text,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb;

create index if not exists idx_audit_logs_pos_session on audit_logs(pos_session_id, created_at desc);
create index if not exists idx_audit_logs_target_user on audit_logs(target_user_id, created_at desc);
create index if not exists idx_audit_logs_device_code on audit_logs(device_code, created_at desc);
