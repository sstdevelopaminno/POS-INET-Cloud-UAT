-- Ingredient cost tracking for per-menu cost report

alter table if exists ingredients
  add column if not exists avg_unit_cost numeric(14,4) not null default 0,
  add column if not exists last_purchase_unit_cost numeric(14,4) not null default 0;

