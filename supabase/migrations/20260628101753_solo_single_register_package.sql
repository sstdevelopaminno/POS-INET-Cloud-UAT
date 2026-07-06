-- Solo/single-register package for shops that do not expose branch selection.
-- Runtime still uses one internal default branch to preserve tenant/branch scoping.

alter table if exists subscription_packages
  add column if not exists yearly_price numeric(12,2);

insert into subscription_packages (
  id,
  code,
  name,
  monthly_price,
  yearly_price,
  max_branches,
  is_active,
  status,
  max_devices,
  max_users,
  metadata
)
values (
  '10000000-0000-0000-0000-000000000010',
  'solo',
  'Solo Register',
  350,
  3850,
  1,
  true,
  'active',
  1,
  3,
  '{"login_mode":"single_register","branch_selection":"hidden","max_cashier_devices":1}'::jsonb
)
on conflict (code) do update
set
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  max_branches = excluded.max_branches,
  is_active = excluded.is_active,
  status = excluded.status,
  max_devices = excluded.max_devices,
  max_users = excluded.max_users,
  metadata = excluded.metadata;

with solo_features(feature_code) as (
  values
    ('core_pos_sales'),
    ('advanced_sales_reports'),
    ('receipt_reprint_history'),
    ('pin_login'),
    ('user_management'),
    ('device_management')
)
insert into subscription_package_features (package_id, feature_code, included)
select p.id, f.feature_code, true
from subscription_packages p
cross join solo_features f
where p.code = 'solo'
on conflict (package_id, feature_code) do update
set
  included = excluded.included,
  updated_at = now();

update subscription_package_features spf
set included = false,
    updated_at = now()
from subscription_packages p
where spf.package_id = p.id
  and p.code = 'solo'
  and spf.feature_code = 'attendance_tracking'
  and spf.included = true;
