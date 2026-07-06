-- Subscription/package/feature gate normalization + compatibility layer

alter table if exists subscription_packages
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive')),
  add column if not exists max_devices integer,
  add column if not exists max_users integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update subscription_packages
set status = case when is_active then 'active' else 'inactive' end
where status is null;

update subscription_packages
set metadata = '{}'::jsonb
where metadata is null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_subscription_packages_touch'
      and tgrelid = 'public.subscription_packages'::regclass
  ) then
    create trigger trg_subscription_packages_touch
    before update on subscription_packages
    for each row execute function app.touch_updated_at();
  end if;
end $$;

alter table if exists tenant_subscription_contracts
  add column if not exists max_branches integer,
  add column if not exists max_devices integer,
  add column if not exists max_users integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update tenant_subscription_contracts
set
  max_branches = coalesce(max_branches, branch_limit),
  max_devices = coalesce(max_devices, terminal_limit_per_branch),
  metadata = coalesce(metadata, '{}'::jsonb);

alter table tenant_subscription_contracts
  drop constraint if exists tenant_subscription_contracts_status_check;

alter table tenant_subscription_contracts
  add constraint tenant_subscription_contracts_status_check
  check (status in ('trial', 'active', 'suspended', 'expired', 'cancelled'));

insert into package_feature_catalog (
  code,
  name,
  description,
  default_monthly_price,
  default_yearly_price,
  default_perpetual_price,
  included_by_default,
  priced_per_branch,
  is_active
)
values
  ('qr_login', 'QR Login', 'Allow QR login verification for POS session handoff', 0, 0, 0, true, true, true),
  ('pin_login', 'PIN Login', 'Allow PIN-based login verification for POS session handoff', 0, 0, 0, true, true, true),
  ('staff_card_login', 'Staff Card Login', 'Allow staff-card-based login verification for POS session handoff', 0, 0, 0, true, true, true),
  ('attendance_tracking', 'Attendance Tracking', 'Allow attendance status/check-in/check-out APIs in POS', 0, 0, 0, true, true, true),
  ('device_management', 'Device Management', 'Allow device management workflows in admin', 0, 0, 0, true, true, true),
  ('branch_management', 'Branch Management', 'Allow branch management workflows in admin', 0, 0, 0, true, true, true),
  ('user_management', 'User Management', 'Allow user role assignment workflows in admin', 0, 0, 0, true, true, true)
on conflict (code) do nothing;

create or replace function app.tenant_has_feature(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_feature_code text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with latest_contract as (
    select c.package_id
    from tenant_subscription_contracts c
    where c.tenant_id = p_tenant_id
      and c.status in ('active', 'trial')
      and (c.ended_at is null or c.ended_at > now())
    order by c.created_at desc
    limit 1
  ),
  plan_feature as (
    select coalesce(spf.included, false) as enabled
    from latest_contract lc
    left join subscription_package_features spf
      on spf.package_id = lc.package_id
     and spf.feature_code = p_feature_code
    limit 1
  ),
  tenant_override as (
    select tfs.is_enabled as enabled
    from tenant_feature_subscriptions tfs
    where tfs.tenant_id = p_tenant_id
      and tfs.branch_id is null
      and tfs.feature_code = p_feature_code
    limit 1
  ),
  branch_override as (
    select tfs.is_enabled as enabled
    from tenant_feature_subscriptions tfs
    where tfs.tenant_id = p_tenant_id
      and tfs.branch_id = p_branch_id
      and tfs.feature_code = p_feature_code
    limit 1
  )
  select
    case
      when not exists (select 1 from latest_contract) then false
      when exists (select 1 from branch_override) then (select enabled from branch_override)
      when exists (select 1 from tenant_override) then (select enabled from tenant_override)
      else coalesce((select enabled from plan_feature), false)
    end;
$$;

revoke all on function app.tenant_has_feature(uuid, uuid, text) from public;
grant execute on function app.tenant_has_feature(uuid, uuid, text) to authenticated;

drop view if exists plans;
create view plans as
select
  sp.id,
  sp.code,
  sp.name,
  sp.status,
  sp.monthly_price,
  coalesce(sp.max_branches, sp.max_branches) as max_branches,
  sp.max_devices,
  sp.max_users,
  sp.metadata,
  sp.created_at,
  sp.updated_at
from subscription_packages sp;

drop view if exists plan_features;
create view plan_features as
select
  spf.id,
  spf.package_id as plan_id,
  spf.feature_code as feature_key,
  spf.included as enabled,
  '{}'::jsonb as metadata,
  spf.created_at
from subscription_package_features spf;

drop view if exists tenant_contracts;
create view tenant_contracts as
select
  tsc.id,
  tsc.tenant_id,
  tsc.package_id as plan_id,
  tsc.status,
  tsc.started_at::date as start_date,
  tsc.ended_at::date as end_date,
  tsc.max_branches,
  tsc.max_devices,
  tsc.max_users,
  tsc.metadata,
  tsc.created_at,
  tsc.updated_at
from tenant_subscription_contracts tsc;

drop view if exists feature_subscriptions;
create view feature_subscriptions as
select
  tfs.id,
  tfs.tenant_id,
  tfs.feature_code as feature_key,
  tfs.is_enabled as enabled,
  tfs.source,
  tfs.created_at,
  tfs.updated_at
from tenant_feature_subscriptions tfs
where tfs.branch_id is null;

drop view if exists branch_feature_overrides;
create view branch_feature_overrides as
select
  tfs.id,
  tfs.tenant_id,
  tfs.branch_id,
  tfs.feature_code as feature_key,
  tfs.is_enabled as enabled,
  tfs.created_at,
  tfs.updated_at
from tenant_feature_subscriptions tfs
where tfs.branch_id is not null;
