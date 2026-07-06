-- Demo seed for noodle shop tenant
-- Run after migrations: 202605170001_init_core.sql and 202605170002_rls_policies.sql

insert into subscription_packages (id, code, name, monthly_price, max_branches, is_active)
values
  ('10000000-0000-0000-0000-000000000001', 'starter', 'Starter MVP', 990, 3, true)
on conflict (id) do nothing;

-- Solo register demo: hidden branch-selection login, one internal default branch, one cashier device.
-- Login values:
--   Store code: SOLO-TH-001
--   Device: SOLO-POS-01
--   Owner employee code: 900001 / PIN 111111
--   Manager employee code: 900002 / PIN 222222
--   Staff employee code: 900003 / PIN 333333

insert into subscription_packages (id, code, name, monthly_price, yearly_price, max_branches, is_active, status, max_devices, max_users, metadata)
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
  '{"login_mode":"single_register","branch_selection":"hidden","max_cashier_devices":1,"monthly_new_customer_discount_percent":10,"monthly_new_customer_discount_months":3,"yearly_free_months":1}'::jsonb
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
  id,
  tenant_id,
  package_id,
  contract_type,
  billing_interval,
  deployment_mode,
  status,
  branch_limit,
  terminal_limit_per_branch,
  amount_per_cycle,
  currency,
  auto_renew,
  max_branches,
  max_devices,
  max_users,
  metadata
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
  350,
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
  id,
  tenant_id,
  branch_id,
  require_qr_login,
  max_devices,
  allow_shared_devices,
  allow_pin_login,
  allow_staff_card_login,
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
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
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
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'advanced_sales_reports', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'receipt_reprint_history', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'pin_login', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'user_management', true, 'package'),
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-000000029001', 'device_management', true, 'package')
on conflict (tenant_id, branch_id, feature_code) do update
set
  is_enabled = excluded.is_enabled,
  source = excluded.source;

update tenant_feature_subscriptions
set is_enabled = false,
    source = 'package'
where tenant_id = '00000000-0000-0000-0000-000000019001'
  and branch_id = '00000000-0000-0000-0000-000000029001'
  and feature_code = 'attendance_tracking'
  and is_enabled = true;

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

-- Multi-tenant demo bundle for login/branch-scope development.
-- Includes: 6 tenants, 12 branches, 18 users (owner/manager/staff), 30 role mappings.
insert into tenants (id, code, name, owner_name, owner_phone, package_id, is_active)
values
  ('00000000-0000-0000-0000-000000010001', 'CAF-TH-001', 'Cafe Atlas', 'Owner Cafe Atlas', '0811001001', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000010002', 'BBQ-TH-002', 'Bangkok BBQ Lab', 'Owner BBQ Lab', '0811001002', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000010003', 'SFD-TH-003', 'Seafood Dock', 'Owner Seafood Dock', '0811001003', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000010004', 'BAK-TH-004', 'Baker Street 24', 'Owner Baker Street 24', '0811001004', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000010005', 'TEA-TH-005', 'Tea Time House', 'Owner Tea Time House', '0811001005', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000010006', 'PIZ-TH-006', 'Pizza Factory', 'Owner Pizza Factory', '0811001006', '10000000-0000-0000-0000-000000000001', true)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  owner_name = excluded.owner_name,
  owner_phone = excluded.owner_phone,
  package_id = excluded.package_id,
  is_active = excluded.is_active;

insert into branches (id, tenant_id, code, name, address, is_active)
values
  ('00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-000000010001', 'CAF-BKK-01', 'Cafe Atlas Rama9', 'Rama 9, Bangkok', true),
  ('00000000-0000-0000-0000-000000020012', '00000000-0000-0000-0000-000000010001', 'CAF-CNX-01', 'Cafe Atlas Nimman', 'Nimman, Chiang Mai', true),
  ('00000000-0000-0000-0000-000000020021', '00000000-0000-0000-0000-000000010002', 'BBQ-BKK-01', 'BBQ Lab Ladprao', 'Ladprao, Bangkok', true),
  ('00000000-0000-0000-0000-000000020022', '00000000-0000-0000-0000-000000010002', 'BBQ-PKT-01', 'BBQ Lab Patong', 'Patong, Phuket', true),
  ('00000000-0000-0000-0000-000000020031', '00000000-0000-0000-0000-000000010003', 'SFD-BKK-01', 'Seafood Dock Sathorn', 'Sathorn, Bangkok', true),
  ('00000000-0000-0000-0000-000000020032', '00000000-0000-0000-0000-000000010003', 'SFD-HDY-01', 'Seafood Dock Hatyai', 'Hat Yai, Songkhla', true),
  ('00000000-0000-0000-0000-000000020041', '00000000-0000-0000-0000-000000010004', 'BAK-BKK-01', 'Baker Street Central', 'Ratchada, Bangkok', true),
  ('00000000-0000-0000-0000-000000020042', '00000000-0000-0000-0000-000000010004', 'BAK-KKN-01', 'Baker Street Khonkaen', 'Mueang, Khon Kaen', true),
  ('00000000-0000-0000-0000-000000020051', '00000000-0000-0000-0000-000000010005', 'TEA-BKK-01', 'Tea Time Siam', 'Siam, Bangkok', true),
  ('00000000-0000-0000-0000-000000020052', '00000000-0000-0000-0000-000000010005', 'TEA-URT-01', 'Tea Time Surat', 'Mueang, Surat Thani', true),
  ('00000000-0000-0000-0000-000000020061', '00000000-0000-0000-0000-000000010006', 'PIZ-BKK-01', 'Pizza Factory Bangna', 'Bangna, Bangkok', true),
  ('00000000-0000-0000-0000-000000020062', '00000000-0000-0000-0000-000000010006', 'PIZ-CBI-01', 'Pizza Factory Chonburi', 'Mueang, Chonburi', true)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  code = excluded.code,
  name = excluded.name,
  address = excluded.address,
  is_active = excluded.is_active;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.caf@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner Cafe Atlas"}'::jsonb),
  ('00000000-0000-0000-0000-000000030012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.caf@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager Cafe Atlas"}'::jsonb),
  ('00000000-0000-0000-0000-000000030013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.caf@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff Cafe Atlas"}'::jsonb),
  ('00000000-0000-0000-0000-000000030021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.bbq@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner BBQ Lab"}'::jsonb),
  ('00000000-0000-0000-0000-000000030022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.bbq@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager BBQ Lab"}'::jsonb),
  ('00000000-0000-0000-0000-000000030023', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.bbq@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff BBQ Lab"}'::jsonb),
  ('00000000-0000-0000-0000-000000030031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.sfd@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner Seafood Dock"}'::jsonb),
  ('00000000-0000-0000-0000-000000030032', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.sfd@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager Seafood Dock"}'::jsonb),
  ('00000000-0000-0000-0000-000000030033', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.sfd@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff Seafood Dock"}'::jsonb),
  ('00000000-0000-0000-0000-000000030041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.bak@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner Baker Street 24"}'::jsonb),
  ('00000000-0000-0000-0000-000000030042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.bak@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager Baker Street 24"}'::jsonb),
  ('00000000-0000-0000-0000-000000030043', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.bak@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff Baker Street 24"}'::jsonb),
  ('00000000-0000-0000-0000-000000030051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.tea@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner Tea Time House"}'::jsonb),
  ('00000000-0000-0000-0000-000000030052', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.tea@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager Tea Time House"}'::jsonb),
  ('00000000-0000-0000-0000-000000030053', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.tea@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff Tea Time House"}'::jsonb),
  ('00000000-0000-0000-0000-000000030061', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.piz@demo.local', crypt('Owner#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner Pizza Factory"}'::jsonb),
  ('00000000-0000-0000-0000-000000030062', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager.piz@demo.local', crypt('Manager#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Manager Pizza Factory"}'::jsonb),
  ('00000000-0000-0000-0000-000000030063', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.piz@demo.local', crypt('Staff#2026', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staff Pizza Factory"}'::jsonb)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  updated_at = now(),
  raw_user_meta_data = excluded.raw_user_meta_data;

insert into users_profiles (id, email, full_name, platform_role, pin_hash, is_active)
values
  ('00000000-0000-0000-0000-000000030011', 'owner.caf@demo.local', 'Owner Cafe Atlas', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030012', 'manager.caf@demo.local', 'Manager Cafe Atlas', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030013', 'staff.caf@demo.local', 'Staff Cafe Atlas', 'tenant_user', crypt('333333', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030021', 'owner.bbq@demo.local', 'Owner BBQ Lab', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030022', 'manager.bbq@demo.local', 'Manager BBQ Lab', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030023', 'staff.bbq@demo.local', 'Staff BBQ Lab', 'tenant_user', crypt('333333', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030031', 'owner.sfd@demo.local', 'Owner Seafood Dock', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030032', 'manager.sfd@demo.local', 'Manager Seafood Dock', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030033', 'staff.sfd@demo.local', 'Staff Seafood Dock', 'tenant_user', crypt('333333', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030041', 'owner.bak@demo.local', 'Owner Baker Street 24', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030042', 'manager.bak@demo.local', 'Manager Baker Street 24', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030043', 'staff.bak@demo.local', 'Staff Baker Street 24', 'tenant_user', crypt('333333', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030051', 'owner.tea@demo.local', 'Owner Tea Time House', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030052', 'manager.tea@demo.local', 'Manager Tea Time House', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030053', 'staff.tea@demo.local', 'Staff Tea Time House', 'tenant_user', crypt('333333', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030061', 'owner.piz@demo.local', 'Owner Pizza Factory', 'tenant_user', crypt('111111', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030062', 'manager.piz@demo.local', 'Manager Pizza Factory', 'tenant_user', crypt('222222', gen_salt('bf')), true),
  ('00000000-0000-0000-0000-000000030063', 'staff.piz@demo.local', 'Staff Pizza Factory', 'tenant_user', crypt('333333', gen_salt('bf')), true)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  platform_role = excluded.platform_role,
  pin_hash = excluded.pin_hash,
  is_active = excluded.is_active;

insert into user_branch_roles (id, user_id, tenant_id, branch_id, role, is_default)
values
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000020011', 'owner', true),
  ('00000000-0000-0000-0000-000000040002', '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000020012', 'owner', false),
  ('00000000-0000-0000-0000-000000040003', '00000000-0000-0000-0000-000000030012', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000020011', 'manager', true),
  ('00000000-0000-0000-0000-000000040004', '00000000-0000-0000-0000-000000030012', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000020012', 'manager', false),
  ('00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000030013', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000020011', 'staff', true),
  ('00000000-0000-0000-0000-000000040006', '00000000-0000-0000-0000-000000030021', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000020021', 'owner', true),
  ('00000000-0000-0000-0000-000000040007', '00000000-0000-0000-0000-000000030021', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000020022', 'owner', false),
  ('00000000-0000-0000-0000-000000040008', '00000000-0000-0000-0000-000000030022', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000020021', 'manager', true),
  ('00000000-0000-0000-0000-000000040009', '00000000-0000-0000-0000-000000030022', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000020022', 'manager', false),
  ('00000000-0000-0000-0000-000000040010', '00000000-0000-0000-0000-000000030023', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000020021', 'staff', true),
  ('00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000030031', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000020031', 'owner', true),
  ('00000000-0000-0000-0000-000000040012', '00000000-0000-0000-0000-000000030031', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000020032', 'owner', false),
  ('00000000-0000-0000-0000-000000040013', '00000000-0000-0000-0000-000000030032', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000020031', 'manager', true),
  ('00000000-0000-0000-0000-000000040014', '00000000-0000-0000-0000-000000030032', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000020032', 'manager', false),
  ('00000000-0000-0000-0000-000000040015', '00000000-0000-0000-0000-000000030033', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000020031', 'staff', true),
  ('00000000-0000-0000-0000-000000040016', '00000000-0000-0000-0000-000000030041', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000020041', 'owner', true),
  ('00000000-0000-0000-0000-000000040017', '00000000-0000-0000-0000-000000030041', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000020042', 'owner', false),
  ('00000000-0000-0000-0000-000000040018', '00000000-0000-0000-0000-000000030042', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000020041', 'manager', true),
  ('00000000-0000-0000-0000-000000040019', '00000000-0000-0000-0000-000000030042', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000020042', 'manager', false),
  ('00000000-0000-0000-0000-000000040020', '00000000-0000-0000-0000-000000030043', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000020041', 'staff', true),
  ('00000000-0000-0000-0000-000000040021', '00000000-0000-0000-0000-000000030051', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000020051', 'owner', true),
  ('00000000-0000-0000-0000-000000040022', '00000000-0000-0000-0000-000000030051', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000020052', 'owner', false),
  ('00000000-0000-0000-0000-000000040023', '00000000-0000-0000-0000-000000030052', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000020051', 'manager', true),
  ('00000000-0000-0000-0000-000000040024', '00000000-0000-0000-0000-000000030052', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000020052', 'manager', false),
  ('00000000-0000-0000-0000-000000040025', '00000000-0000-0000-0000-000000030053', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000020051', 'staff', true),
  ('00000000-0000-0000-0000-000000040026', '00000000-0000-0000-0000-000000030061', '00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000020061', 'owner', true),
  ('00000000-0000-0000-0000-000000040027', '00000000-0000-0000-0000-000000030061', '00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000020062', 'owner', false),
  ('00000000-0000-0000-0000-000000040028', '00000000-0000-0000-0000-000000030062', '00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000020061', 'manager', true),
  ('00000000-0000-0000-0000-000000040029', '00000000-0000-0000-0000-000000030062', '00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000020062', 'manager', false),
  ('00000000-0000-0000-0000-000000040030', '00000000-0000-0000-0000-000000030063', '00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000020061', 'staff', true)
on conflict (user_id, tenant_id, branch_id) do update
set
  role = excluded.role,
  is_default = excluded.is_default;

insert into pos_user_profiles (tenant_id, user_id, employee_code, position_title, permission_role)
values
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000030011', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000030012', 'MGR-030012', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000030013', 'STF-030013', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000030021', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000030022', 'MGR-030022', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000030023', 'STF-030023', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000030031', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000030032', 'MGR-030032', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000030033', 'STF-030033', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000030041', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000030042', 'MGR-030042', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-000000030043', 'STF-030043', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000030051', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000030052', 'MGR-030052', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-000000030053', 'STF-030053', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000030061', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000030062', 'MGR-030062', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000010006', '00000000-0000-0000-0000-000000030063', 'STF-030063', 'Staff', 'staff')
on conflict (tenant_id, user_id) do update
set
  employee_code = excluded.employee_code,
  position_title = excluded.position_title,
  permission_role = excluded.permission_role;

with seeded_branches (tenant_id, branch_id, brand_prefix) as (
  values
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020011'::uuid, 'CAF'),
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020012'::uuid, 'CAF'),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020021'::uuid, 'BBQ'),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020022'::uuid, 'BBQ'),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020031'::uuid, 'SFD'),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020032'::uuid, 'SFD'),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020041'::uuid, 'BAK'),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020042'::uuid, 'BAK'),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020051'::uuid, 'TEA'),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020052'::uuid, 'TEA'),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020061'::uuid, 'PIZ'),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020062'::uuid, 'PIZ')
),
channel_templates (channel_code, channel_name, is_manual, is_active) as (
  values
    ('storefront', 'หน้าร้าน', true, true),
    ('delivery_manual', 'เดลิเวอรี', true, true)
),
expanded_channels as (
  select
    b.tenant_id,
    b.branch_id,
    c.channel_code,
    c.channel_name,
    c.is_manual,
    c.is_active,
    row_number() over (order by b.tenant_id, b.branch_id, c.channel_code) as rn
  from seeded_branches b
  cross join channel_templates c
)
insert into merchant_channels (id, tenant_id, branch_id, channel_code, channel_name, is_manual, is_active)
select
  ('00000000-0000-0000-0000-' || lpad((880000 + rn)::text, 12, '0'))::uuid,
  tenant_id,
  branch_id,
  channel_code,
  channel_name,
  is_manual,
  is_active
from expanded_channels
on conflict (tenant_id, branch_id, channel_code) do update
set
  channel_name = excluded.channel_name,
  is_manual = excluded.is_manual,
  is_active = excluded.is_active;

with seeded_branches (tenant_id, branch_id, brand_prefix) as (
  values
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020011'::uuid, 'CAF'),
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020012'::uuid, 'CAF'),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020021'::uuid, 'BBQ'),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020022'::uuid, 'BBQ'),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020031'::uuid, 'SFD'),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020032'::uuid, 'SFD'),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020041'::uuid, 'BAK'),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020042'::uuid, 'BAK'),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020051'::uuid, 'TEA'),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020052'::uuid, 'TEA'),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020061'::uuid, 'PIZ'),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020062'::uuid, 'PIZ')
),
product_templates (sku_suffix, product_name, category, price, is_combo, is_active) as (
  values
    ('001', 'Signature Dish', 'อาหาร', 79::numeric, false, true),
    ('002', 'Special Set', 'อาหาร', 99::numeric, false, true),
    ('D01', 'House Drink', 'เครื่องดื่ม', 35::numeric, false, true)
),
expanded_products as (
  select
    b.tenant_id,
    b.branch_id,
    (b.brand_prefix || '-' || p.sku_suffix) as sku,
    p.product_name,
    p.category,
    p.price,
    p.is_combo,
    p.is_active,
    row_number() over (order by b.tenant_id, b.branch_id, p.sku_suffix) as rn
  from seeded_branches b
  cross join product_templates p
)
insert into products (id, tenant_id, branch_id, sku, name, category, price, is_combo, is_active)
select
  ('00000000-0000-0000-0000-' || lpad((890000 + rn)::text, 12, '0'))::uuid,
  tenant_id,
  branch_id,
  sku,
  product_name,
  category,
  price,
  is_combo,
  is_active
from expanded_products
on conflict (tenant_id, branch_id, sku) do update
set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  is_combo = excluded.is_combo,
  is_active = excluded.is_active;

with seeded_branches (tenant_id, branch_id) as (
  values
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020011'::uuid),
    ('00000000-0000-0000-0000-000000010001'::uuid, '00000000-0000-0000-0000-000000020012'::uuid),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020021'::uuid),
    ('00000000-0000-0000-0000-000000010002'::uuid, '00000000-0000-0000-0000-000000020022'::uuid),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020031'::uuid),
    ('00000000-0000-0000-0000-000000010003'::uuid, '00000000-0000-0000-0000-000000020032'::uuid),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020041'::uuid),
    ('00000000-0000-0000-0000-000000010004'::uuid, '00000000-0000-0000-0000-000000020042'::uuid),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020051'::uuid),
    ('00000000-0000-0000-0000-000000010005'::uuid, '00000000-0000-0000-0000-000000020052'::uuid),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020061'::uuid),
    ('00000000-0000-0000-0000-000000010006'::uuid, '00000000-0000-0000-0000-000000020062'::uuid)
),
table_templates (table_code, seats, is_active) as (
  values
    ('A01', 4, true),
    ('A02', 4, true)
),
expanded_tables as (
  select
    b.tenant_id,
    b.branch_id,
    t.table_code,
    t.seats,
    t.is_active,
    row_number() over (order by b.tenant_id, b.branch_id, t.table_code) as rn
  from seeded_branches b
  cross join table_templates t
)
insert into dine_in_tables (id, tenant_id, branch_id, table_code, seats, is_active)
select
  ('00000000-0000-0000-0000-' || lpad((870000 + rn)::text, 12, '0'))::uuid,
  tenant_id,
  branch_id,
  table_code,
  seats,
  is_active
from expanded_tables
on conflict (tenant_id, branch_id, table_code) do update
set
  seats = excluded.seats,
  is_active = excluded.is_active;

insert into tenants (id, code, name, owner_name, owner_phone, package_id, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'NDL-TH-001', 'ก๋วยเตี๋ยวคุณหนึ่ง', 'คุณหนึ่ง', '0899990001', '10000000-0000-0000-0000-000000000001', true)
on conflict (id) do nothing;

insert into branches (id, tenant_id, code, name, address, is_active)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'BKK-01', 'สาขาอารีย์', 'พหลโยธิน ซอย 7', true),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'BKK-02', 'สาขาสะพานควาย', 'ประดิพัทธ์ 15', true)
on conflict (id) do nothing;

-- Demo users in auth.users for local development
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner@noodle.local',
    crypt('Owner#1234', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"เจ้าของร้าน"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'manager@noodle.local',
    crypt('Manager#1234', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"ผู้จัดการร้าน"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'staff@noodle.local',
    crypt('Staff#1234', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"พนักงาน"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'itadmin@platform.local',
    crypt('ITAdmin#1234', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"IT Admin"}'::jsonb
  )
on conflict (id) do nothing;

insert into users_profiles (id, email, full_name, platform_role, pin_hash, is_active)
values
  ('00000000-0000-0000-0000-000000000101', 'owner@noodle.local', 'เจ้าของร้าน', 'tenant_user', '$2b$10$hlUTBQXtPd.rLARdgqwdCevHf.H5lCFdkyEWgBuMp14bFXpT6rdPa', true),
  ('00000000-0000-0000-0000-000000000102', 'manager@noodle.local', 'ผู้จัดการร้าน', 'tenant_user', '$2b$10$xQcyWHhdQv9np9kafFlupedqZlEQQXVzOmXhSJxd/Hqw7ZWQ6xeO.', true),
  ('00000000-0000-0000-0000-000000000103', 'staff@noodle.local', 'พนักงาน', 'tenant_user', '$2b$10$KKtFBMTXToXbAoykqHz6uOyMTVchHrBwVUt4CUEJF6WkVQffUM482', true),
  ('00000000-0000-0000-0000-000000000901', 'itadmin@platform.local', 'IT Admin', 'it_admin', null, true)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  platform_role = excluded.platform_role,
  pin_hash = excluded.pin_hash,
  is_active = excluded.is_active;

insert into user_branch_roles (id, user_id, tenant_id, branch_id, role, is_default)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'owner', true),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'manager', true),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'staff', true)
on conflict (user_id, tenant_id, branch_id) do update
set role = excluded.role;

insert into pos_user_profiles (tenant_id, user_id, employee_code, position_title, permission_role)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '182536', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'MGR-000102', 'Manager', 'manager'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'STF-000103', 'Staff', 'staff')
on conflict (tenant_id, user_id) do update
set
  employee_code = excluded.employee_code,
  position_title = excluded.position_title,
  permission_role = excluded.permission_role;

insert into dine_in_tables (id, tenant_id, branch_id, table_code, seats, is_active)
values
  ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'A01', 4, true),
  ('00000000-0000-0000-0000-000000007002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'A02', 4, true)
on conflict (tenant_id, branch_id, table_code) do nothing;

insert into table_zones (id, tenant_id, branch_id, zone_name, color, display_order, is_active)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Main Hall', '#16a34a', 1, true),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Terrace', '#2563eb', 2, true)
on conflict (tenant_id, branch_id, zone_name) do nothing;

insert into dining_tables (
  id, tenant_id, branch_id, zone_id, table_code, table_name, capacity, status, shape,
  position_x, position_y, width, height, rotation, is_active
)
values
  (
    '00000000-0000-0000-0000-000000007001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-00000000a001',
    'A01',
    'A01',
    4,
    'available',
    'rectangle',
    120,
    120,
    96,
    72,
    0,
    true
  ),
  (
    '00000000-0000-0000-0000-000000007002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-00000000a001',
    'A02',
    'A02',
    4,
    'available',
    'rectangle',
    260,
    120,
    96,
    72,
    0,
    true
  )
on conflict (tenant_id, branch_id, table_code) do nothing;

insert into merchant_channels (id, tenant_id, branch_id, channel_code, channel_name, is_manual, is_active)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'storefront', 'หน้าร้าน', true, true),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'walk_home', 'กลับบ้าน', true, true),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'grab', 'Grab', true, true),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'line_man', 'LINE MAN', true, true),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'shopee', 'Shopee', true, true),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'merchant_app', 'Merchant App', true, true),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'other', 'อื่นๆ', true, true)
on conflict (tenant_id, branch_id, channel_code) do nothing;

insert into products (id, tenant_id, branch_id, sku, name, category, price, is_combo, is_active)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'NDL-001', 'ก๋วยเตี๋ยวหมูน้ำใส', 'เส้น', 65, false, true),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'NDL-002', 'ก๋วยเตี๋ยวต้มยำ', 'เส้น', 75, false, true),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'DRK-001', 'น้ำเก๊กฮวย', 'เครื่องดื่ม', 25, false, true),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'CMB-001', 'ชุดคอมโบเส้น+น้ำ', 'คอมโบ', 85, true, true)
on conflict (tenant_id, branch_id, sku) do nothing;

insert into product_combo_items (id, tenant_id, branch_id, combo_product_id, child_product_id, qty)
values
  ('41000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 1),
  ('41000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 1)
on conflict (combo_product_id, child_product_id) do nothing;

insert into ingredients (id, tenant_id, branch_id, name, base_unit, quantity_on_hand, reorder_level)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'ลูกชิ้น', 'ลูก', 900, 150),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'เส้น', 'กรัม', 12000, 2000),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'น้ำซุป', 'มล.', 30000, 5000),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'ผัก', 'กรัม', 4000, 800),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'กล่องกลับบ้าน', 'ชิ้น', 500, 80)
on conflict (tenant_id, branch_id, name) do nothing;

insert into ingredient_packages (id, tenant_id, branch_id, ingredient_id, package_name, unit_count)
values
  ('51000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', '1 ถุงลูกชิ้น', 30),
  ('51000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000002', '1 มัดเส้น', 1000)
on conflict do nothing;

insert into recipes (id, tenant_id, branch_id, product_id, ingredient_id, quantity_per_item, applies_when_takeaway_only)
values
  ('52000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 5, false),
  ('52000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 120, false),
  ('52000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 300, false),
  ('52000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 20, false),
  ('52000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 1, true)
on conflict (product_id, ingredient_id, applies_when_takeaway_only) do nothing;

insert into shifts (id, tenant_id, branch_id, opened_by, opening_cash, status)
values
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000102', 2000, 'open')
on conflict (id) do nothing;

insert into orders (
  id, tenant_id, branch_id, shift_id, order_no, order_type, channel, delivery_status, table_id,
  external_order_code, customer_name, notes, subtotal, discount_amount, gp_amount, total_amount, status, created_by
)
values
  (
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000008001',
    'DINE-001',
    'dine_in',
    'storefront',
    null,
    '00000000-0000-0000-0000-000000007001',
    null,
    'โต๊ะ A01',
    'ไม่ผักชี',
    130,
    0,
    0,
    130,
    'preparing',
    '00000000-0000-0000-0000-000000000103'
  ),
  (
    '00000000-0000-0000-0000-000000001002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000008001',
    'DEL-001',
    'delivery_manual',
    'grab',
    'pending',
    null,
    'GRAB-778899',
    'ลูกค้า Grab',
    'ลด GP 10 บาท',
    75,
    0,
    10,
    65,
    'queued',
    '00000000-0000-0000-0000-000000000103'
  )
on conflict (tenant_id, branch_id, order_no) do nothing;

insert into order_items (id, tenant_id, branch_id, order_id, product_id, quantity, unit_price, line_total, notes)
values
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001001', '40000000-0000-0000-0000-000000000001', 2, 65, 130, null),
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001002', '40000000-0000-0000-0000-000000000002', 1, 75, 75, null)
on conflict (id) do nothing;

insert into payments (id, tenant_id, branch_id, order_id, method, amount, reference_no, received_by)
values
  ('62000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001001', 'cash', 130, null, '00000000-0000-0000-0000-000000000103')
on conflict (id) do nothing;

insert into audit_logs (
  id, tenant_id, branch_id, actor_user_id, actor_role, action, target_table, target_id, metadata
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000102',
    'manager',
    'shift_opened',
    'shifts',
    '00000000-0000-0000-0000-000000008001',
    '{"opening_cash":2000}'::jsonb
  )
on conflict (id) do nothing;

