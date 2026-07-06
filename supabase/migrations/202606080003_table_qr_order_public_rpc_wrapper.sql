create or replace function public.submit_table_qr_order_tx(
  p_qr_session_id uuid,
  p_request_id text,
  p_items jsonb,
  p_note text default null
)
returns table(
  submission_id uuid,
  order_id uuid,
  order_no text,
  table_id uuid,
  table_session_id uuid,
  subtotal numeric,
  tax_total numeric,
  grand_total numeric,
  duplicate_request boolean
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.submit_table_qr_order_tx($1, $2, $3, $4);
$$;

revoke all on function public.submit_table_qr_order_tx(uuid, text, jsonb, text) from public;
revoke all on function public.submit_table_qr_order_tx(uuid, text, jsonb, text) from anon;
revoke all on function public.submit_table_qr_order_tx(uuid, text, jsonb, text) from authenticated;
grant execute on function public.submit_table_qr_order_tx(uuid, text, jsonb, text) to service_role;

notify pgrst, 'reload schema';
