create or replace function app.enforce_order_cancellation_approval() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    -- Temporary relaxation: allow cancellation without manager PIN approval.
    -- If approval id is provided, still validate as before.
    if new.cancellation_approval_id is not null then
      if not exists (
        select 1
        from manager_pin_approvals a
        where a.id = new.cancellation_approval_id
          and a.action = 'cancel_bill'
          and a.target_table = 'orders'
          and a.target_id = new.id
          and a.expires_at > now()
      ) then
        raise exception 'Cancellation approval is invalid or expired.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
