-- Fix missing delivery snapshot columns on public.orders
-- and force PostgREST schema cache reload.
-- Safe to run multiple times.

alter table if exists public.orders
  add column if not exists delivery_pricing_channel text,
  add column if not exists delivery_app_subtotal numeric(12,2),
  add column if not exists delivery_commission_rate_pct numeric(7,3),
  add column if not exists delivery_commission_amount numeric(12,2),
  add column if not exists delivery_commission_vat_rate_pct numeric(7,3),
  add column if not exists delivery_commission_vat_amount numeric(12,2),
  add column if not exists delivery_platform_fee_amount numeric(12,2),
  add column if not exists delivery_net_payout_amount numeric(12,2),
  add column if not exists delivery_pricing_source_url text,
  add column if not exists delivery_pricing_note text;

-- Ask PostgREST to refresh schema cache.
notify pgrst, 'reload schema';

-- Verification
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'delivery_pricing_channel',
    'delivery_app_subtotal',
    'delivery_commission_rate_pct',
    'delivery_commission_amount',
    'delivery_commission_vat_rate_pct',
    'delivery_commission_vat_amount',
    'delivery_platform_fee_amount',
    'delivery_net_payout_amount',
    'delivery_pricing_source_url',
    'delivery_pricing_note'
  )
order by column_name;
