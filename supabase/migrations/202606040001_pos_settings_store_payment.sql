-- POS settings: store profile and branch payment accounts.

alter table tenants
  add column if not exists display_name text,
  add column if not exists logo_url text,
  add column if not exists company_address text,
  add column if not exists contact_phone text;

create table if not exists tenant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  promptpay_phone text,
  promptpay_payload text,
  qr_image_url text,
  is_active boolean not null default true,
  created_by uuid references users_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_payment_accounts_scope
on tenant_payment_accounts(tenant_id, branch_id, is_active);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_tenant_payment_accounts_touch'
  ) then
    create trigger trg_tenant_payment_accounts_touch
    before update on tenant_payment_accounts
    for each row execute function app.touch_updated_at();
  end if;
end $$;

alter table tenant_payment_accounts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_payment_accounts'
      and policyname = 'tenant_payment_accounts_isolation'
  ) then
    create policy tenant_payment_accounts_isolation
    on tenant_payment_accounts
    for all
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin())
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;
