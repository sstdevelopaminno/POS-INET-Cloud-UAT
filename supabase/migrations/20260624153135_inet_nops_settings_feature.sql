-- INET NOPS settings operations and subscription feature gate.
-- Merchant keys remain server-side deployment secrets and are never stored here.

alter table pos_payment_provider_settings
  add column if not exists callback_url text,
  add column if not exists connection_status text not null default 'not_configured',
  add column if not exists last_connection_checked_at timestamptz,
  add column if not exists last_connection_error text,
  add column if not exists last_test_order_id text;

alter table pos_payment_provider_settings
  drop constraint if exists pos_payment_provider_settings_connection_status_check;

alter table pos_payment_provider_settings
  add constraint pos_payment_provider_settings_connection_status_check
  check (connection_status in ('not_configured', 'ready', 'error', 'disabled'));

create index if not exists idx_pos_payment_provider_settings_inet_scope
on pos_payment_provider_settings(tenant_id, branch_id, provider, updated_at desc);

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
values (
  'inet_nops_qr',
  'INET NOPS QR Payment',
  'Dynamic QR payment with INET server-to-server confirmation',
  490,
  5880,
  8900,
  false,
  true,
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  default_monthly_price = excluded.default_monthly_price,
  default_yearly_price = excluded.default_yearly_price,
  default_perpetual_price = excluded.default_perpetual_price,
  priced_per_branch = excluded.priced_per_branch,
  is_active = excluded.is_active;
