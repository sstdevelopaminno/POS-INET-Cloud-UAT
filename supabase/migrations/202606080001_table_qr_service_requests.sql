alter table public.table_qr_orders
  add column if not exists event_type text not null default 'order';

alter table public.table_qr_orders
  alter column order_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'table_qr_orders_event_type_check'
      and conrelid = 'public.table_qr_orders'::regclass
  ) then
    alter table public.table_qr_orders
      add constraint table_qr_orders_event_type_check
      check (event_type in ('order', 'call_staff', 'request_checkout'));
  end if;
end $$;

update public.table_qr_orders
set event_type = 'order'
where event_type is null;
