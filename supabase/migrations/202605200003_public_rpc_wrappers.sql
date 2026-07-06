-- Expose transaction RPC entrypoints through public schema for PostgREST/Supabase Data API.

create or replace function public.create_pos_order_tx(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_created_by uuid,
  p_order_type order_type,
  p_channel text,
  p_table_id uuid,
  p_external_order_code text,
  p_customer_name text,
  p_notes text,
  p_app_total_amount numeric,
  p_discount_amount numeric,
  p_gp_amount numeric,
  p_items jsonb,
  p_request_id text default null,
  p_order_no text default null
)
returns table(
  order_id uuid,
  order_no text,
  order_status text,
  created_at timestamptz,
  duplicate_request boolean
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.create_pos_order_tx(
    p_tenant_id,
    p_branch_id,
    p_shift_id,
    p_created_by,
    p_order_type,
    p_channel,
    p_table_id,
    p_external_order_code,
    p_customer_name,
    p_notes,
    p_app_total_amount,
    p_discount_amount,
    p_gp_amount,
    p_items,
    p_request_id,
    p_order_no
  );
$$;

create or replace function public.complete_pos_payment_tx(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_received_by uuid,
  p_payment_lines jsonb,
  p_request_group_id text default null
)
returns table(
  payment_group_id text,
  total_paid numeric,
  order_status text,
  duplicate_request boolean
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.complete_pos_payment_tx(
    p_tenant_id,
    p_branch_id,
    p_order_id,
    p_received_by,
    p_payment_lines,
    p_request_group_id
  );
$$;

create or replace function public.create_manual_delivery_order_tx(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_created_by uuid,
  p_channel text,
  p_external_order_code text,
  p_customer_name text,
  p_notes text,
  p_app_total_amount numeric,
  p_discount_amount numeric,
  p_gp_amount numeric,
  p_items jsonb,
  p_request_id text default null,
  p_order_no text default null
)
returns table(
  order_id uuid,
  order_status text,
  created_at timestamptz,
  duplicate_request boolean
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.create_manual_delivery_order_tx(
    p_tenant_id,
    p_branch_id,
    p_shift_id,
    p_created_by,
    p_channel,
    p_external_order_code,
    p_customer_name,
    p_notes,
    p_app_total_amount,
    p_discount_amount,
    p_gp_amount,
    p_items,
    p_request_id,
    p_order_no
  );
$$;

create or replace function public.create_stock_adjustment_tx(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_ingredient_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_created_by uuid,
  p_approval_id uuid,
  p_request_id text default null
)
returns table(
  movement_id uuid,
  movement_status text,
  created_at timestamptz,
  duplicate_request boolean
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.create_stock_adjustment_tx(
    p_tenant_id,
    p_branch_id,
    p_ingredient_id,
    p_quantity_delta,
    p_reason,
    p_created_by,
    p_approval_id,
    p_request_id
  );
$$;

grant execute on function public.create_pos_order_tx(
  uuid, uuid, uuid, uuid, order_type, text, uuid, text, text, text, numeric, numeric, numeric, jsonb, text, text
) to service_role;

grant execute on function public.complete_pos_payment_tx(
  uuid, uuid, uuid, uuid, jsonb, text
) to service_role;

grant execute on function public.create_manual_delivery_order_tx(
  uuid, uuid, uuid, uuid, text, text, text, text, numeric, numeric, numeric, jsonb, text, text
) to service_role;

grant execute on function public.create_stock_adjustment_tx(
  uuid, uuid, uuid, numeric, text, uuid, uuid, text
) to service_role;
