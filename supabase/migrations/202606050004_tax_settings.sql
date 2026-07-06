create table if not exists tenant_tax_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  is_enabled boolean not null default false,
  calculation_base text not null default 'net_after_discount',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id)
);

create index if not exists idx_tenant_tax_settings_scope
  on tenant_tax_settings(tenant_id, branch_id);

drop trigger if exists trg_tenant_tax_settings_touch on tenant_tax_settings;
create trigger trg_tenant_tax_settings_touch
before update on tenant_tax_settings
for each row execute function app.touch_updated_at();
