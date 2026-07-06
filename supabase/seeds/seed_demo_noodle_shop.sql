-- Demo seed for noodle shop tenant
-- Run after migrations: 202605170001_init_core.sql and 202605170002_rls_policies.sql

insert into subscription_packages (id, code, name, monthly_price, max_branches, is_active)
values
  ('10000000-0000-0000-0000-000000000001', 'starter', 'Starter MVP', 990, 3, true)
on conflict (id) do nothing;

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

