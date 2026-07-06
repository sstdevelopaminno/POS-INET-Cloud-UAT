-- INET NOPS QR payment provider support.
-- Existing PromptPay/manual bank transfer settings remain unchanged.

create table if not exists pos_payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  provider text not null,
  environment text not null default 'uat',
  merchant_id text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_payment_provider_settings_provider_check
    check (provider in ('promptpay_manual', 'inet_nops')),
  constraint pos_payment_provider_settings_environment_check
    check (environment in ('uat', 'production'))
);

create unique index if not exists pos_payment_provider_settings_active_provider_uidx
on pos_payment_provider_settings(tenant_id, branch_id, provider)
where is_active;

create index if not exists idx_pos_payment_provider_settings_scope
on pos_payment_provider_settings(tenant_id, branch_id, provider, is_active);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_pos_payment_provider_settings_touch'
  ) then
    create trigger trg_pos_payment_provider_settings_touch
    before update on pos_payment_provider_settings
    for each row execute function app.touch_updated_at();
  end if;
end $$;

alter table pos_payment_provider_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_payment_provider_settings'
      and policyname = 'pos_payment_provider_settings_isolation'
  ) then
    create policy pos_payment_provider_settings_isolation
    on pos_payment_provider_settings
    for all
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin())
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

create table if not exists pos_payment_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_order_id text not null unique,
  merchant_id text,
  amount numeric(12,2) not null,
  currency text not null default 'THB',
  status text not null default 'pending',
  inet_ref1 text,
  inet_ref2 text,
  inet_payment_reference_id text,
  qr_code text,
  request_group_id text,
  paid_at timestamptz,
  failed_reason text,
  raw_create_response jsonb not null default '{}'::jsonb,
  created_by uuid references users_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_payment_intents_provider_check
    check (provider in ('inet_nops')),
  constraint pos_payment_intents_status_check
    check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  constraint pos_payment_intents_amount_check
    check (amount > 0),
  constraint pos_payment_intents_currency_check
    check (currency = 'THB')
);

create unique index if not exists pos_payment_intents_pending_order_provider_uidx
on pos_payment_intents(tenant_id, branch_id, order_id, provider)
where status = 'pending';

create index if not exists idx_pos_payment_intents_scope_status
on pos_payment_intents(tenant_id, branch_id, provider, status, created_at desc);

create index if not exists idx_pos_payment_intents_order
on pos_payment_intents(tenant_id, branch_id, order_id, provider);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_pos_payment_intents_touch'
  ) then
    create trigger trg_pos_payment_intents_touch
    before update on pos_payment_intents
    for each row execute function app.touch_updated_at();
  end if;
end $$;

alter table pos_payment_intents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_payment_intents'
      and policyname = 'pos_payment_intents_isolation'
  ) then
    create policy pos_payment_intents_isolation
    on pos_payment_intents
    for all
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin())
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;

create table if not exists pos_payment_callback_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  tenant_id uuid references tenants(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  payment_intent_id uuid references pos_payment_intents(id) on delete set null,
  event text,
  provider_timestamp text,
  retry_flag text,
  provider_order_id text,
  payment_reference_id text,
  response_code integer,
  response_message text,
  receive_amount numeric(12,2),
  payment_type text,
  payment_acquirer_bank text,
  transaction_date text,
  transaction_time text,
  order_description text,
  raw_payload jsonb not null,
  processing_status text not null default 'received',
  error_message text,
  created_at timestamptz not null default now(),
  constraint pos_payment_callback_logs_provider_check
    check (provider in ('inet_nops')),
  constraint pos_payment_callback_logs_processing_status_check
    check (processing_status in ('received', 'processed', 'duplicate', 'validation_failed', 'error'))
);

create index if not exists idx_pos_payment_callback_logs_provider_order
on pos_payment_callback_logs(provider, provider_order_id, created_at desc);

create index if not exists idx_pos_payment_callback_logs_intent
on pos_payment_callback_logs(payment_intent_id, created_at desc);

alter table pos_payment_callback_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pos_payment_callback_logs'
      and policyname = 'pos_payment_callback_logs_isolation'
  ) then
    create policy pos_payment_callback_logs_isolation
    on pos_payment_callback_logs
    for all
    using (
      tenant_id is null
      or branch_id is null
      or app.has_branch_access(tenant_id, branch_id)
      or app.is_it_admin()
    )
    with check (
      tenant_id is null
      or branch_id is null
      or app.has_branch_access(tenant_id, branch_id)
      or app.is_it_admin()
    );
  end if;
end $$;
