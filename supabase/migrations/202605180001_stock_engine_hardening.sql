-- Stock Engine Hardening v0.1.1
-- Goals: prevent negative stock, support concurrent order creation,
-- ensure atomic recipe deduction, and provide rollback-safe transactions.

alter table if exists ingredients
  drop constraint if exists chk_ingredients_quantity_non_negative;

alter table if exists ingredients
  add constraint chk_ingredients_quantity_non_negative
  check (quantity_on_hand >= 0);

alter table if exists orders
  add column if not exists request_id text;

create unique index if not exists idx_orders_tenant_branch_request_id
  on orders(tenant_id, branch_id, request_id)
  where request_id is not null;

alter table if exists stock_movements
  add column if not exists request_id text;

create unique index if not exists idx_stock_movements_tenant_branch_request_id
  on stock_movements(tenant_id, branch_id, request_id)
  where request_id is not null;

create or replace function app.create_manual_delivery_order_tx(
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
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_existing_order record;
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_gp numeric(12,2);
  v_total numeric(12,2);
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric(12,3);
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  rec record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_ITEMS_REQUIRED';
  end if;

  if p_request_id is not null then
    select id, status, created_at
    into v_existing_order
    from orders
    where tenant_id = p_tenant_id
      and branch_id = p_branch_id
      and request_id = p_request_id
    limit 1;

    if found then
      return query
      select v_existing_order.id, v_existing_order.status::text, v_existing_order.created_at, true;
      return;
    end if;
  end if;

  v_subtotal := round(coalesce(p_app_total_amount, 0)::numeric, 2);
  v_discount := round(greatest(coalesce(p_discount_amount, 0), 0)::numeric, 2);
  v_gp := round(greatest(coalesce(p_gp_amount, 0), 0)::numeric, 2);
  v_total := round(v_subtotal - v_discount - v_gp, 2);

  if v_total < 0 then
    raise exception 'NEGATIVE_ORDER_TOTAL';
  end if;

  v_order_id := gen_random_uuid();
  v_order_no := coalesce(
    p_order_no,
    format('DLV-%s-%s', to_char(now(), 'YYYYMMDDHH24MISSMS'), substr(replace(v_order_id::text, '-', ''), 1, 6))
  );

  insert into orders (
    id,
    tenant_id,
    branch_id,
    shift_id,
    order_no,
    order_type,
    channel,
    delivery_status,
    external_order_code,
    customer_name,
    notes,
    subtotal,
    discount_amount,
    gp_amount,
    total_amount,
    status,
    created_by,
    request_id
  )
  values (
    v_order_id,
    p_tenant_id,
    p_branch_id,
    p_shift_id,
    v_order_no,
    'delivery_manual',
    p_channel,
    'pending',
    p_external_order_code,
    p_customer_name,
    p_notes,
    v_subtotal,
    v_discount,
    v_gp,
    v_total,
    'queued',
    p_created_by,
    p_request_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    if v_product_id is null then
      raise exception 'INVALID_PRODUCT_ID';
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_ITEM_QTY';
    end if;

    select p.price
    into v_unit_price
    from products p
    where p.id = v_product_id
      and p.tenant_id = p_tenant_id
      and p.branch_id = p_branch_id
      and p.is_active = true;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND:%', v_product_id;
    end if;

    v_line_total := round(v_unit_price * v_qty, 2);

    insert into order_items (
      tenant_id,
      branch_id,
      order_id,
      product_id,
      quantity,
      unit_price,
      line_total,
      notes
    )
    values (
      p_tenant_id,
      p_branch_id,
      v_order_id,
      v_product_id,
      v_qty,
      v_unit_price,
      v_line_total,
      nullif(v_item->>'notes', '')
    );
  end loop;

  for rec in
    with recipe_requirements as (
      select
        r.ingredient_id,
        sum(oi.quantity * r.quantity_per_item) as required_qty
      from order_items oi
      join recipes r
        on r.product_id = oi.product_id
       and r.tenant_id = p_tenant_id
       and r.branch_id = p_branch_id
      where oi.order_id = v_order_id
        and oi.tenant_id = p_tenant_id
        and oi.branch_id = p_branch_id
        and (r.applies_when_takeaway_only = false or r.applies_when_takeaway_only = true)
      group by r.ingredient_id
    )
    select ingredient_id, required_qty
    from recipe_requirements
    where required_qty > 0
  loop
    update ingredients i
    set quantity_on_hand = i.quantity_on_hand - rec.required_qty
    where i.id = rec.ingredient_id
      and i.tenant_id = p_tenant_id
      and i.branch_id = p_branch_id
      and i.quantity_on_hand >= rec.required_qty;

    if not found then
      if exists (
        select 1
        from ingredients i
        where i.id = rec.ingredient_id
          and i.tenant_id = p_tenant_id
          and i.branch_id = p_branch_id
      ) then
        raise exception 'INSUFFICIENT_STOCK:%', rec.ingredient_id;
      end if;

      raise exception 'INGREDIENT_NOT_FOUND:%', rec.ingredient_id;
    end if;

    insert into stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      movement_type,
      quantity_delta,
      reason,
      ref_table,
      ref_id,
      created_by,
      request_id
    )
    values (
      p_tenant_id,
      p_branch_id,
      rec.ingredient_id,
      'sale_deduction',
      -rec.required_qty,
      'Auto deduction from recipe',
      'orders',
      v_order_id,
      p_created_by,
      null
    );
  end loop;

  return query
  select v_order_id, 'queued'::text, now(), false;
exception
  when unique_violation then
    if p_request_id is not null then
      select id, status, created_at
      into v_existing_order
      from orders
      where tenant_id = p_tenant_id
        and branch_id = p_branch_id
        and request_id = p_request_id
      limit 1;

      if found then
        return query
        select v_existing_order.id, v_existing_order.status::text, v_existing_order.created_at, true;
        return;
      end if;
    end if;

    raise;
end;
$$;

create or replace function app.create_stock_adjustment_tx(
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
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_existing_movement record;
  v_movement_id uuid;
begin
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'INVALID_QUANTITY_DELTA';
  end if;

  if p_request_id is not null then
    select id, created_at
    into v_existing_movement
    from stock_movements
    where tenant_id = p_tenant_id
      and branch_id = p_branch_id
      and request_id = p_request_id
      and movement_type = 'manual_adjustment'
    limit 1;

    if found then
      return query
      select v_existing_movement.id, 'recorded'::text, v_existing_movement.created_at, true;
      return;
    end if;
  end if;

  if p_quantity_delta < 0 then
    update ingredients i
    set quantity_on_hand = i.quantity_on_hand + p_quantity_delta
    where i.id = p_ingredient_id
      and i.tenant_id = p_tenant_id
      and i.branch_id = p_branch_id
      and i.quantity_on_hand >= abs(p_quantity_delta);

    if not found then
      if exists (
        select 1
        from ingredients i
        where i.id = p_ingredient_id
          and i.tenant_id = p_tenant_id
          and i.branch_id = p_branch_id
      ) then
        raise exception 'INSUFFICIENT_STOCK:%', p_ingredient_id;
      end if;

      raise exception 'INGREDIENT_NOT_FOUND:%', p_ingredient_id;
    end if;
  else
    update ingredients i
    set quantity_on_hand = i.quantity_on_hand + p_quantity_delta
    where i.id = p_ingredient_id
      and i.tenant_id = p_tenant_id
      and i.branch_id = p_branch_id;

    if not found then
      raise exception 'INGREDIENT_NOT_FOUND:%', p_ingredient_id;
    end if;
  end if;

  v_movement_id := gen_random_uuid();

  insert into stock_movements (
    id,
    tenant_id,
    branch_id,
    ingredient_id,
    movement_type,
    quantity_delta,
    reason,
    approval_id,
    created_by,
    request_id
  )
  values (
    v_movement_id,
    p_tenant_id,
    p_branch_id,
    p_ingredient_id,
    'manual_adjustment',
    p_quantity_delta,
    p_reason,
    p_approval_id,
    p_created_by,
    p_request_id
  );

  return query
  select v_movement_id, 'recorded'::text, now(), false;
exception
  when unique_violation then
    if p_request_id is not null then
      select id, created_at
      into v_existing_movement
      from stock_movements
      where tenant_id = p_tenant_id
        and branch_id = p_branch_id
        and request_id = p_request_id
        and movement_type = 'manual_adjustment'
      limit 1;

      if found then
        return query
        select v_existing_movement.id, 'recorded'::text, v_existing_movement.created_at, true;
        return;
      end if;
    end if;

    raise;
end;
$$;

grant execute on function app.create_manual_delivery_order_tx(
  uuid, uuid, uuid, uuid, text, text, text, text, numeric, numeric, numeric, jsonb, text, text
) to service_role;

grant execute on function app.create_stock_adjustment_tx(
  uuid, uuid, uuid, numeric, text, uuid, uuid, text
) to service_role;
