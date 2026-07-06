create table if not exists pos_customer_display_pairings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  channel text not null default 'main',
  pair_code_hash text not null,
  pair_code_expires_at timestamptz not null,
  pair_code_used_at timestamptz,
  device_token_hash text unique,
  device_token_expires_at timestamptz,
  device_name text,
  created_by uuid references users_profiles(id),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_customer_display_pairings_scope
on pos_customer_display_pairings(tenant_id, branch_id, channel, created_at desc);

create index if not exists idx_pos_customer_display_pairings_code
on pos_customer_display_pairings(pair_code_hash, pair_code_expires_at desc);

create index if not exists idx_pos_customer_display_pairings_token
on pos_customer_display_pairings(device_token_hash, device_token_expires_at desc);

create trigger trg_pos_customer_display_pairings_touch
before update on pos_customer_display_pairings
for each row execute function app.touch_updated_at();

alter table pos_customer_display_pairings enable row level security;

create policy pos_customer_display_pairings_select
on pos_customer_display_pairings
for select
using (app.has_branch_access(tenant_id, branch_id));

create policy pos_customer_display_pairings_write
on pos_customer_display_pairings
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
