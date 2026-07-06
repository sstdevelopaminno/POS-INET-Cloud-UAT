create table if not exists pos_user_profiles (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  employee_code text not null,
  position_title text not null default '',
  permission_role text not null default 'pos_user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  unique (tenant_id, employee_code)
);

create index if not exists idx_pos_user_profiles_code on pos_user_profiles(tenant_id, employee_code);

create trigger trg_pos_user_profiles_touch
before update on pos_user_profiles
for each row execute function app.touch_updated_at();
