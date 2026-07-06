create table if not exists pos_user_approval_permissions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  action approval_action not null,
  is_enabled boolean not null default false,
  pin_hash text,
  granted_by uuid references users_profiles(id) on delete set null,
  granted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, branch_id, user_id, action),
  constraint pos_user_approval_permissions_staff_action_check check (action = 'cancel_bill')
);

create index if not exists idx_pos_user_approval_permissions_lookup
on pos_user_approval_permissions(tenant_id, branch_id, action, is_enabled, user_id);

drop trigger if exists trg_pos_user_approval_permissions_touch on pos_user_approval_permissions;
create trigger trg_pos_user_approval_permissions_touch
before update on pos_user_approval_permissions
for each row execute function app.touch_updated_at();

alter table pos_user_approval_permissions enable row level security;

drop policy if exists pos_user_approval_permissions_select on pos_user_approval_permissions;
create policy pos_user_approval_permissions_select
on pos_user_approval_permissions
for select
using (app.has_tenant_access(tenant_id));

drop policy if exists pos_user_approval_permissions_owner_manage on pos_user_approval_permissions;
create policy pos_user_approval_permissions_owner_manage
on pos_user_approval_permissions
for all
using (
  exists (
    select 1
    from user_branch_roles ubr
    where ubr.user_id = auth.uid()
      and ubr.tenant_id = pos_user_approval_permissions.tenant_id
      and ubr.branch_id = pos_user_approval_permissions.branch_id
      and ubr.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from user_branch_roles ubr
    where ubr.user_id = auth.uid()
      and ubr.tenant_id = pos_user_approval_permissions.tenant_id
      and ubr.branch_id = pos_user_approval_permissions.branch_id
      and ubr.role = 'owner'
  )
);

create or replace function app.configure_staff_cancel_bill_approval(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_is_enabled boolean,
  p_pin_hash text,
  p_granted_by uuid
) returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not exists (
    select 1
    from user_branch_roles owner_role
    where owner_role.tenant_id = p_tenant_id
      and owner_role.branch_id = p_branch_id
      and owner_role.user_id = p_granted_by
      and owner_role.role = 'owner'
  ) then
    raise exception 'Only an owner in the same branch can configure staff cancel-bill approval.';
  end if;

  if not exists (
    select 1
    from user_branch_roles staff_role
    where staff_role.tenant_id = p_tenant_id
      and staff_role.branch_id = p_branch_id
      and staff_role.user_id = p_user_id
      and staff_role.role = 'staff'
  ) then
    raise exception 'Cancel-bill approval can only be assigned to staff in the same branch.';
  end if;

  if p_is_enabled and coalesce(length(p_pin_hash), 0) = 0 then
    raise exception 'PIN hash is required when enabling staff cancel-bill approval.';
  end if;

  insert into pos_user_approval_permissions (
    tenant_id,
    branch_id,
    user_id,
    action,
    is_enabled,
    pin_hash,
    granted_by,
    granted_at
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_user_id,
    'cancel_bill',
    p_is_enabled,
    case when p_is_enabled then p_pin_hash else null end,
    p_granted_by,
    case when p_is_enabled then now() else null end
  )
  on conflict (tenant_id, branch_id, user_id, action)
  do update set
    is_enabled = excluded.is_enabled,
    pin_hash = excluded.pin_hash,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at,
    updated_at = now();
end;
$$;

create or replace function public.configure_staff_cancel_bill_approval(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_is_enabled boolean,
  p_pin_hash text,
  p_granted_by uuid
) returns void
language sql
security definer
set search_path = public, app
as $$
  select app.configure_staff_cancel_bill_approval(
    p_tenant_id,
    p_branch_id,
    p_user_id,
    p_is_enabled,
    p_pin_hash,
    p_granted_by
  );
$$;

revoke all on function public.configure_staff_cancel_bill_approval(uuid, uuid, uuid, boolean, text, uuid) from public;
grant execute on function public.configure_staff_cancel_bill_approval(uuid, uuid, uuid, boolean, text, uuid) to service_role;

create or replace function app.revoke_staff_approval_on_role_change() returns trigger language plpgsql as $$
begin
  if old.role = 'staff' and new.role <> 'staff' then
    update pos_user_approval_permissions
    set
      is_enabled = false,
      pin_hash = null,
      granted_at = null,
      updated_at = now()
    where tenant_id = old.tenant_id
      and branch_id = old.branch_id
      and user_id = old.user_id
      and action = 'cancel_bill';

  end if;

  return new;
end;
$$;

drop trigger if exists trg_revoke_staff_approval_on_role_change on user_branch_roles;
create trigger trg_revoke_staff_approval_on_role_change
after update of role on user_branch_roles
for each row execute function app.revoke_staff_approval_on_role_change();

create or replace function app.enforce_approval_approver_role() returns trigger language plpgsql as $$
begin
  if exists (
    select 1
    from user_branch_roles ubr
    where ubr.user_id = new.approved_by
      and ubr.tenant_id = new.tenant_id
      and ubr.branch_id = new.branch_id
      and ubr.role in ('manager', 'owner')
  ) then
    return new;
  end if;

  if new.action = 'cancel_bill' and exists (
    select 1
    from user_branch_roles ubr
    join pos_user_approval_permissions permission
      on permission.tenant_id = ubr.tenant_id
     and permission.branch_id = ubr.branch_id
     and permission.user_id = ubr.user_id
     and permission.action = 'cancel_bill'
     and permission.is_enabled = true
    where ubr.user_id = new.approved_by
      and ubr.tenant_id = new.tenant_id
      and ubr.branch_id = new.branch_id
      and ubr.role = 'staff'
  ) then
    return new;
  end if;

  raise exception 'Approver is not authorized for this action in the same branch.';
end;
$$;
