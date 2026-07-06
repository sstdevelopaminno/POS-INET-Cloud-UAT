create table if not exists table_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  table_id uuid not null references dining_tables(id) on delete cascade,
  table_session_id uuid not null references table_bill_sessions(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by uuid not null references users_profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_table_qr_sessions_active_table_session
  on table_qr_sessions(table_session_id)
  where status = 'active';

create index if not exists idx_table_qr_sessions_scope
  on table_qr_sessions(tenant_id, branch_id, table_id, status, expires_at);

create table if not exists table_qr_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  table_id uuid not null references dining_tables(id) on delete cascade,
  table_session_id uuid not null references table_bill_sessions(id) on delete cascade,
  qr_session_id uuid not null references table_qr_sessions(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  request_id text not null,
  item_count integer not null default 0,
  subtotal numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (qr_session_id, request_id)
);

create index if not exists idx_table_qr_orders_table_session_created
  on table_qr_orders(tenant_id, branch_id, table_session_id, created_at desc);

alter table table_qr_sessions enable row level security;
alter table table_qr_orders enable row level security;

drop trigger if exists trg_table_qr_sessions_touch on table_qr_sessions;
create trigger trg_table_qr_sessions_touch
before update on table_qr_sessions
for each row execute function app.touch_updated_at();

create or replace function app.revoke_table_qr_session_on_bill_close()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.status in ('closed', 'cancelled') and old.status is distinct from new.status then
    update table_qr_sessions
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now())
    where tenant_id = new.tenant_id
      and branch_id = new.branch_id
      and table_session_id = new.id
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_table_bill_session_revoke_qr on table_bill_sessions;
create trigger trg_table_bill_session_revoke_qr
after update of status on table_bill_sessions
for each row execute function app.revoke_table_qr_session_on_bill_close();

create or replace function app.submit_table_qr_order_tx(
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
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_qr table_qr_sessions%rowtype;
  v_session table_bill_sessions%rowtype;
  v_shift_id uuid;
  v_order_id uuid;
  v_order_no text;
  v_submission_id uuid;
  v_item jsonb;
  v_product record;
  v_quantity numeric(12,3);
  v_line_total numeric(12,2);
  v_new_subtotal numeric(12,2) := 0;
  v_order_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;
  v_tax_settings record;
  v_tax_line jsonb;
  v_tax_rate numeric(8,4);
  v_tax_amount numeric(12,2);
  v_tax_mode text;
  v_tax_lines jsonb := '[]'::jsonb;
  v_existing record;
  v_item_count integer;
begin
  if nullif(trim(p_request_id), '') is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITEMS_REQUIRED';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 50 then
    raise exception 'INVALID_ITEM_COUNT';
  end if;

  select *
  into v_qr
  from table_qr_sessions
  where id = p_qr_session_id
  for update;

  if not found then
    raise exception 'QR_SESSION_NOT_FOUND';
  end if;
  if v_qr.status <> 'active' or v_qr.expires_at <= now() then
    if v_qr.status = 'active' and v_qr.expires_at <= now() then
      update table_qr_sessions set status = 'expired' where id = v_qr.id;
    end if;
    raise exception 'QR_SESSION_EXPIRED';
  end if;

  select *
  into v_existing
  from table_qr_orders
  where qr_session_id = v_qr.id
    and request_id = trim(p_request_id)
  limit 1;

  if found then
    select o.order_no, o.subtotal, coalesce(o.tax_total, 0), coalesce(o.grand_total, o.total_amount)
    into v_order_no, v_order_subtotal, v_tax_total, v_grand_total
    from orders o
    where o.id = v_existing.order_id;

    return query
    select
      v_existing.id,
      v_existing.order_id,
      v_order_no,
      v_existing.table_id,
      v_existing.table_session_id,
      v_order_subtotal,
      v_tax_total,
      v_grand_total,
      true;
    return;
  end if;

  select *
  into v_session
  from table_bill_sessions
  where id = v_qr.table_session_id
    and tenant_id = v_qr.tenant_id
    and branch_id = v_qr.branch_id
    and table_id = v_qr.table_id
  for update;

  if not found
     or v_session.status not in ('open', 'ordering', 'pending_payment')
     or v_session.closed_at is not null then
    raise exception 'TABLE_SESSION_CLOSED';
  end if;

  if not exists (
    select 1
    from dining_tables dt
    where dt.id = v_qr.table_id
      and dt.tenant_id = v_qr.tenant_id
      and dt.branch_id = v_qr.branch_id
      and dt.is_active = true
      and dt.status in ('occupied', 'ordering', 'pending_payment')
  ) then
    raise exception 'TABLE_NOT_AVAILABLE';
  end if;

  select s.id
  into v_shift_id
  from shifts s
  where s.tenant_id = v_qr.tenant_id
    and s.branch_id = v_qr.branch_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    raise exception 'SHIFT_NOT_OPEN';
  end if;

  v_order_id := v_session.order_id;
  if v_order_id is not null then
    select o.order_no, coalesce(o.discount_amount, 0)
    into v_order_no, v_discount
    from orders o
    where o.id = v_order_id
      and o.tenant_id = v_qr.tenant_id
      and o.branch_id = v_qr.branch_id
      and o.table_id = v_qr.table_id
      and o.status = 'queued'
    for update;
    if not found then
      raise exception 'ORDER_NOT_UPDATABLE';
    end if;
  else
    v_order_id := gen_random_uuid();
    v_order_no := format(
      'DIN-QR-%s-%s',
      to_char(now(), 'YYYYMMDDHH24MISS'),
      upper(substr(replace(v_order_id::text, '-', ''), 1, 6))
    );
    insert into orders (
      id, tenant_id, branch_id, shift_id, order_no, order_type, channel,
      table_id, subtotal, discount_amount, gp_amount, total_amount,
      tax_total, grand_total, metadata, status, created_by
    )
    values (
      v_order_id, v_qr.tenant_id, v_qr.branch_id, v_shift_id, v_order_no,
      'dine_in', 'table_qr', v_qr.table_id, 0, 0, 0, 0, 0, 0,
      jsonb_build_object('tax_lines', '[]'::jsonb, 'source', 'table_qr'),
      'queued', v_session.opened_by
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := nullif(v_item->>'quantity', '')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 99 then
      raise exception 'INVALID_ITEM_QUANTITY';
    end if;

    select p.id, p.name, p.price
    into v_product
    from products p
    where p.id = nullif(v_item->>'product_id', '')::uuid
      and p.tenant_id = v_qr.tenant_id
      and p.branch_id = v_qr.branch_id
      and p.is_active = true;

    if not found then
      raise exception 'PRODUCT_NOT_AVAILABLE';
    end if;

    v_line_total := round(v_product.price * v_quantity, 2);
    v_new_subtotal := v_new_subtotal + v_line_total;

    insert into order_items (
      tenant_id, branch_id, order_id, product_id, quantity,
      unit_price, line_total, notes
    )
    values (
      v_qr.tenant_id, v_qr.branch_id, v_order_id, v_product.id, v_quantity,
      v_product.price, v_line_total, nullif(left(trim(coalesce(v_item->>'note', '')), 240), '')
    );
  end loop;

  select round(coalesce(sum(oi.line_total), 0), 2)
  into v_order_subtotal
  from order_items oi
  where oi.tenant_id = v_qr.tenant_id
    and oi.branch_id = v_qr.branch_id
    and oi.order_id = v_order_id;

  select t.is_enabled, t.settings
  into v_tax_settings
  from tenant_tax_settings t
  where t.tenant_id = v_qr.tenant_id
    and t.branch_id = v_qr.branch_id
  limit 1;

  if found and v_tax_settings.is_enabled = true then
    for v_tax_line in
      select value
      from jsonb_array_elements(coalesce(v_tax_settings.settings->'lines', '[]'::jsonb))
    loop
      if coalesce((v_tax_line->>'is_active')::boolean, true) = true then
        v_tax_rate := greatest(coalesce(nullif(v_tax_line->>'rate_pct', '')::numeric, 0), 0);
        if v_tax_rate > 0 then
          v_tax_mode := coalesce(v_tax_line->>'mode', 'add_to_bill');
          v_tax_amount := round(greatest(v_order_subtotal - v_discount, 0) * (v_tax_rate / 100), 2);
          if v_tax_mode = 'deduct_from_bill' then
            v_tax_amount := -v_tax_amount;
          end if;
          v_tax_total := v_tax_total + v_tax_amount;
          v_tax_lines := v_tax_lines || jsonb_build_array(jsonb_build_object(
            'id', coalesce(v_tax_line->>'id', gen_random_uuid()::text),
            'label', coalesce(v_tax_line->>'label', 'Tax'),
            'rate_pct', v_tax_rate,
            'mode', v_tax_mode,
            'amount', v_tax_amount
          ));
        end if;
      end if;
    end loop;
  end if;

  v_tax_total := round(v_tax_total, 2);
  v_grand_total := round(greatest(v_order_subtotal - v_discount + v_tax_total, 0), 2);

  update orders
  set shift_id = v_shift_id,
      subtotal = v_order_subtotal,
      total_amount = v_grand_total,
      tax_total = v_tax_total,
      grand_total = v_grand_total,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'tax_lines', v_tax_lines,
        'last_table_qr_order_at', now()
      )
  where id = v_order_id
    and tenant_id = v_qr.tenant_id
    and branch_id = v_qr.branch_id;

  update table_bill_sessions
  set order_id = v_order_id,
      status = 'ordering',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_order_id', v_order_id,
        'last_order_no', v_order_no,
        'last_table_qr_order_at', now()
      )
  where id = v_session.id;

  update dining_tables
  set status = 'ordering'
  where id = v_qr.table_id
    and tenant_id = v_qr.tenant_id
    and branch_id = v_qr.branch_id;

  v_submission_id := gen_random_uuid();
  insert into table_qr_orders (
    id, tenant_id, branch_id, table_id, table_session_id, qr_session_id,
    order_id, request_id, item_count, subtotal, payload
  )
  values (
    v_submission_id, v_qr.tenant_id, v_qr.branch_id, v_qr.table_id,
    v_session.id, v_qr.id, v_order_id, trim(p_request_id), v_item_count,
    v_new_subtotal, jsonb_build_object('items', p_items, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return query
  select
    v_submission_id,
    v_order_id,
    v_order_no,
    v_qr.table_id,
    v_session.id,
    v_order_subtotal,
    v_tax_total,
    v_grand_total,
    false;
end;
$$;

revoke all on function app.submit_table_qr_order_tx(uuid, text, jsonb, text) from public;
grant execute on function app.submit_table_qr_order_tx(uuid, text, jsonb, text) to service_role;
