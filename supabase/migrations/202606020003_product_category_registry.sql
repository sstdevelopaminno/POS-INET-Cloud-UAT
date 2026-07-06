-- Product category registry for POS stock/product management.
-- Products still store their category text; this table preserves empty categories for dropdowns.

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  created_by uuid references users_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, name)
);

create index if not exists idx_product_categories_scope_name
  on product_categories(tenant_id, branch_id, name);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_product_categories_touch'
      and tgrelid = 'public.product_categories'::regclass
  ) then
    create trigger trg_product_categories_touch
    before update on product_categories
    for each row execute function app.touch_updated_at();
  end if;
end $$;

insert into product_categories (tenant_id, branch_id, name)
select distinct tenant_id, branch_id, trim(category)
from products
where trim(coalesce(category, '')) <> ''
on conflict (tenant_id, branch_id, name) do nothing;

alter table product_categories enable row level security;

drop policy if exists tenant_branch_tables_isolation_product_categories on product_categories;
create policy tenant_branch_tables_isolation_product_categories
on product_categories
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
