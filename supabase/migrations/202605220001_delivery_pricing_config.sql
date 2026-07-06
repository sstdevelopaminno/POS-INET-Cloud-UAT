-- Delivery pricing configuration (channel commission + product app prices)

create table if not exists delivery_channel_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  channel text not null check (channel in ('grab', 'line_man', 'shopee', 'foodpanda', 'merchant_app', 'other')),
  commission_rate_pct numeric(6,3) not null default 30,
  commission_vat_rate_pct numeric(6,3) not null default 7,
  order_code_rule text not null default 'free_text' check (order_code_rule in ('free_text', 'regex')),
  order_code_regex text,
  order_code_example text,
  source_title text,
  source_url text,
  source_checked_at timestamptz,
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid references users_profiles(id),
  updated_by uuid references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, channel)
);

create table if not exists product_channel_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  channel text not null check (channel in ('grab', 'line_man', 'shopee', 'foodpanda', 'merchant_app', 'other')),
  app_price numeric(12,2) not null check (app_price >= 0),
  is_active boolean not null default true,
  created_by uuid references users_profiles(id),
  updated_by uuid references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, product_id, channel)
);

create index if not exists idx_delivery_channel_configs_scope
  on delivery_channel_configs(tenant_id, branch_id, channel, is_active);

create index if not exists idx_product_channel_prices_scope
  on product_channel_prices(tenant_id, branch_id, channel, product_id, is_active);

alter table if exists orders
  add column if not exists delivery_pricing_channel text,
  add column if not exists delivery_app_subtotal numeric(12,2),
  add column if not exists delivery_commission_rate_pct numeric(6,3),
  add column if not exists delivery_commission_amount numeric(12,2),
  add column if not exists delivery_commission_vat_rate_pct numeric(6,3),
  add column if not exists delivery_commission_vat_amount numeric(12,2),
  add column if not exists delivery_platform_fee_amount numeric(12,2),
  add column if not exists delivery_net_payout_amount numeric(12,2),
  add column if not exists delivery_pricing_source_url text,
  add column if not exists delivery_pricing_note text;

drop trigger if exists trg_delivery_channel_configs_touch on delivery_channel_configs;
create trigger trg_delivery_channel_configs_touch
before update on delivery_channel_configs
for each row
execute function app.touch_updated_at();

drop trigger if exists trg_product_channel_prices_touch on product_channel_prices;
create trigger trg_product_channel_prices_touch
before update on product_channel_prices
for each row
execute function app.touch_updated_at();
