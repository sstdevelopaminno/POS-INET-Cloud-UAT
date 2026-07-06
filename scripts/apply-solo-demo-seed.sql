do $$
begin
insert into tenants (id, code, name, owner_name, owner_phone, package_id, is_active)
values (
  '00000000-0000-0000-0000-000000019001',
  'SOLO-TH-001',
  'Solo Register Demo',
  'Solo Owner',
  '0800009001',
  '10000000-0000-0000-0000-000000000010',
  true
)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  owner_name = excluded.owner_name,
  owner_phone = excluded.owner_phone,
  package_id = excluded.package_id,
  is_active = excluded.is_active;

insert into tenant_subscription_contracts (
  id, tenant_id, package_id, contract_type, billing_interval, deployment_mode, status,
  branch_limit, terminal_limit_per_branch, amount_per_cycle, currency, auto_renew,
  max_branches, max_devices, max_users, metadata
)
select
  '00000000-0000-0000-0000-000000019101',
  '00000000-0000-0000-0000-000000019001',
  id,
  'saas',
  'monthly',
  'cloud',
  'active',
  1,
  1,
  790,
  'THB',
  true,
  1,
  1,
  3,
  '{"demo":"solo_register","branch_selection":"hidden"}'::jsonb
from subscription_packages
where code = 'solo'
on conflict (id) do update
set
  package_id = excluded.package_id,
  status = excluded.status,
  branch_limit = excluded.branch_limit,
  terminal_limit_per_branch = excluded.terminal_limit_per_branch,
  amount_per_cycle = excluded.amount_per_cycle,
  max_branches = excluded.max_branches,
  max_devices = excluded.max_devices,
  max_users = excluded.max_users,
  metadata = excluded.metadata;

insert into branches (id, tenant_id, code, name, address, is_active)
values (
  '00000000-0000-0000-0000-000000029001',
  '00000000-0000-0000-0000-000000019001',
  'MAIN',
  'Default Register',
  'Internal default branch for solo login',
  true
)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  code = excluded.code,
  name = excluded.name,
  address = excluded.address,
  is_active = excluded.is_active;

insert into branch_login_policies (
  id, tenant_id, branch_id, require_qr_login, max_devices,
  allow_shared_devices, allow_pin_login, allow_staff_card_login,
  require_registered_device
)
values (
  '00000000-0000-0000-0000-000000029101',
  '00000000-0000-0000-0000-000000019001',
  '00000000-0000-0000-0000-000000029001',
  false,
  1,
  false,
  true,
  true,
  false
)
on conflict (tenant_id, branch_id) do update
set
  require_qr_login = excluded.require_qr_login,
  max_devices = excluded.max_devices,
  allow_shared_devices = excluded.allow_shared_devices,
  allow_pin_login = excluded.allow_pin_login,
  allow_staff_card_login = excluded.allow_staff_card_login,
  require_registered_device = excluded.require_registered_device;

insert into branch_devices (id, tenant_id, branch_id, device_code, device_name, device_type, status, is_locked, metadata)
values (
  '00000000-0000-0000-0000-000000059001',
  '00000000-0000-0000-0000-000000019001',
  '00000000-0000-0000-0000-000000029001',
  'SOLO-POS-01',
  'Solo Cashier 01',
  'pos_terminal',
  'active',
  true,
  '{"counter_name":"Cashier 1","solo_register":true}'::jsonb
)
on conflict (tenant_id, branch_id, device_code) do update
set
  device_name = excluded.device_name,
  device_type = excluded.device_type,
  status = excluded.status,
  is_locked = excluded.is_locked,
  metadata = excluded.metadata;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000039001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.solo@demo.local', crypt('SoloOwner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Solo Owner"}'::jsonb),
  ('00000000-0000-0000-0000-000000039002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.solo@demo.local', crypt('SoloManager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Solo Manager"}'::jsonb),
  ('00000000-0000-0000-0000-000000039003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.solo@demo.local', crypt('SoloStaff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Solo Staff"}'::jsonb)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  updated_at = now(),
  raw_user_meta_data = excluded.raw_user_meta_data;

insert into users_profiles (id, email, full_name, platform_role, pin_hash, is_active)
values
  ('00000000-0000-0000-0000-000000039001', 'owner.solo@demo.local', 'Solo Owner', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000039002', 'manager.solo@demo.local', 'Solo Manager', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000039003', 'staff.solo@demo.local', 'Solo Staff', 'tenant_user', crypt('333333', gen_salt('bf')), true)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  platform_role = excluded.platform_role,
  pin_hash = excluded.pin_hash,
  is_active = excluded.is_active;

insert into user_branch_roles (id, user_id, tenant_id, branch_id, role, is_default)
values
  ('00000000-0000-0000-0000-000000049001', '00000000-0000-0000-0000-000000039001', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'owner', true),
  ('00000000-0000-0000-0000-000000049002', '00000000-0000-0000-0000-000000039002', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'manager', true),
  ('00000000-0000-0000-0000-000000049003', '00000000-0000-0000-0000-000000039003', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'staff', true)
on conflict (user_id, tenant_id, branch_id) do update
set
  role = excluded.role,
  is_default = excluded.is_default;

insert into pos_user_profiles (tenant_id, user_id, employee_code, position_title, permission_role)
values
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000039001', '900001', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000039002', '900002', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000039003', '900003', 'Staff', 'staff')
on conflict (tenant_id, user_id) do update
set
  employee_code = excluded.employee_code,
  position_title = excluded.position_title,
  permission_role = excluded.permission_role;

insert into pos_user_device_scopes (tenant_id, branch_id, user_id, scope_mode, device_id)
values
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', '00000000-0000-0000-0000-000000039001', 'single_device', '00000000-0000-0000-0000-000000059001'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', '00000000-0000-0000-0000-000000039002', 'single_device', '00000000-0000-0000-0000-000000059001'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', '00000000-0000-0000-0000-000000039003', 'single_device', '00000000-0000-0000-0000-000000059001')
on conflict (tenant_id, branch_id, user_id) do update
set
  scope_mode = excluded.scope_mode,
  device_id = excluded.device_id;

insert into tenant_feature_subscriptions (tenant_id, branch_id, feature_code, is_enabled, source)
values
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'core_pos_sales', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'pin_login', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'attendance_tracking', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'user_management', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'device_management', true, 'package')
on conflict (tenant_id, branch_id, feature_code) do update
set
  is_enabled = excluded.is_enabled,
  source = excluded.source;

insert into merchant_channels (id, tenant_id, branch_id, channel_code, channel_name, is_manual, is_active)
values
  ('30000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'storefront', 'Storefront', true, true),
  ('30000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'delivery_manual', 'Manual Delivery', true, true)
on conflict (tenant_id, branch_id, channel_code) do update
set
  channel_name = excluded.channel_name,
  is_manual = excluded.is_manual,
  is_active = excluded.is_active;

insert into products (id, tenant_id, branch_id, sku, name, category, price, is_combo, is_active)
values
  ('40000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'SOLO-001', 'Quick Sale Item', 'Food', 59, false, true),
  ('40000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'SOLO-002', 'Special Item', 'Food', 79, false, true),
  ('40000000-0000-0000-0000-000000009003', '00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'SOLO-D01', 'House Drink', 'Drink', 25, false, true)
on conflict (tenant_id, branch_id, sku) do update
set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  is_combo = excluded.is_combo,
  is_active = excluded.is_active;
end $$;
