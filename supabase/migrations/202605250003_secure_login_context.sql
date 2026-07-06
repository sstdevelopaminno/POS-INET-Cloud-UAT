-- Secure temporary login context for store->branch handoff

alter table branch_login_policies
  add column if not exists allow_pin_login boolean not null default true,
  add column if not exists allow_staff_card_login boolean not null default true;

create table if not exists pos_login_contexts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  store_code text not null,
  device_code text,
  status text not null default 'active' check (status in ('active', 'consumed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_login_contexts_status_expiry on pos_login_contexts(status, expires_at);
create index if not exists idx_pos_login_contexts_scope on pos_login_contexts(tenant_id, branch_id, created_at desc);

create trigger trg_pos_login_contexts_touch
before update on pos_login_contexts
for each row execute function app.touch_updated_at();

alter table pos_login_contexts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_login_contexts'
      and policyname = 'pos_login_contexts_select'
  ) then
    create policy pos_login_contexts_select
    on pos_login_contexts
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
      and tablename = 'pos_login_contexts'
      and policyname = 'pos_login_contexts_insert'
  ) then
    create policy pos_login_contexts_insert
    on pos_login_contexts
    for insert
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_login_contexts'
      and policyname = 'pos_login_contexts_update'
  ) then
    create policy pos_login_contexts_update
    on pos_login_contexts
    for update
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin())
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;
