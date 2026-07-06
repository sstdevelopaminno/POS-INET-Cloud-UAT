-- Product management enhancement:
-- support two stock deduction modes
-- 1) unit_only: sell as a simple unit (piece/bottle/cup)
-- 2) recipe_deduction: sell menu item and deduct ingredient recipe

alter table if exists products
  add column if not exists stock_deduction_mode text not null default 'unit_only'
    check (stock_deduction_mode in ('unit_only', 'recipe_deduction')),
  add column if not exists sell_unit text not null default 'unit';

create index if not exists idx_products_stock_deduction_mode
  on products(tenant_id, branch_id, stock_deduction_mode, is_active);

-- Backfill existing products that already have recipe rows.
update products p
set stock_deduction_mode = 'recipe_deduction'
where exists (
  select 1
  from recipes r
  where r.tenant_id = p.tenant_id
    and r.branch_id = p.branch_id
    and r.product_id = p.id
)
and p.stock_deduction_mode <> 'recipe_deduction';
