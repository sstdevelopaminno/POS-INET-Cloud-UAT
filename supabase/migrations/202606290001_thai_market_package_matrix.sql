-- Thai-market POS package matrix, pricing metadata, and feature catalog sync.
-- Additive rollout: existing tenant contracts keep their selected package id and overrides.

alter table if exists subscription_packages
  add column if not exists yearly_price numeric(12,2),
  add column if not exists max_devices integer,
  add column if not exists max_users integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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
  ('core_pos_sales', 'Core POS Sales', 'Core sales screen, order creation, checkout, and receipt workflow.', 0, 0, 0, false, false, true),
  ('stock_management', 'Stock Management', 'Product catalog, menu scan, recipes, ingredients, and stock adjustments.', 290, 3190, 5900, false, true, true),
  ('table_management', 'Table Management', 'Open tables, move bills, manage floor zones, and track dine-in bill status.', 490, 5390, 8900, false, true, true),
  ('qr_table_ordering', 'QR Table Ordering', 'Customer table QR ordering that sends items into the active POS table bill.', 690, 7590, 14900, false, true, true),
  ('delivery_ordering', 'Delivery Ordering', 'Delivery app order mode, held delivery bills, and channel-specific pricing.', 390, 4290, 6900, false, true, true),
  ('customer_facing_display', 'Customer Display', 'Customer-facing realtime item and total display.', 250, 2750, 4900, false, false, true),
  ('transfer_slip_verification', 'Transfer Slip Verification', 'Upload and verify transfer slips before closing a bill.', 390, 4290, 6900, false, true, true),
  ('staff_qr_clockin', 'Staff QR Clock-in', 'QR-based staff clock-in flow.', 190, 2090, 3900, false, true, true),
  ('advanced_sales_reports', 'Advanced Sales Reports', 'Detailed sales summaries, filters, and multi-branch reporting.', 790, 8690, 16900, false, false, true),
  ('receipt_reprint_history', 'Receipt Reprint History', 'Search historical receipts and reprint with approval/audit support.', 290, 3190, 5900, false, true, true),
  ('multi_terminal_sync', 'Multi Terminal Sync', 'Synchronize sales state across multiple terminals in a branch.', 590, 6490, 12900, false, true, true),
  ('offline_queue_resilience', 'Offline Queue Resilience', 'Offline queue and automatic retry when connectivity returns.', 350, 3850, 6900, false, true, true),
  ('desktop_app_runtime', 'Desktop App Runtime', 'Installed desktop runtime for online/offline hybrid operations.', 450, 4950, 10900, false, false, true),
  ('barcode_scanner_mode', 'Barcode Scanner Mode', 'Barcode scanner optimized checkout mode.', 290, 3190, 5900, false, true, true),
  ('kitchen_printing', 'Kitchen Printing', 'Send kitchen tickets to configured printer stations.', 350, 3850, 6900, false, true, true),
  ('inet_nops_qr', 'INET NOPS QR Payment', 'Dynamic QR payment with INET server-to-server confirmation.', 490, 5390, 8900, false, true, true),
  ('qr_login', 'QR Login', 'QR login verification for POS session handoff.', 0, 0, 0, false, true, true),
  ('pin_login', 'PIN Login', 'PIN-based POS login verification.', 0, 0, 0, false, true, true),
  ('staff_card_login', 'Staff Card Login', 'Staff-card based POS login verification.', 0, 0, 0, false, true, true),
  ('attendance_tracking', 'Attendance Tracking', 'Attendance status, check-in, check-out, and manual status APIs.', 0, 0, 0, false, true, true),
  ('device_management', 'Device Management', 'Device management and POS register controls.', 0, 0, 0, false, true, true),
  ('branch_management', 'Branch Management', 'Branch management workflows and branch-scoped controls.', 0, 0, 0, false, true, true),
  ('user_management', 'User Management', 'User role assignment and staff management workflows.', 0, 0, 0, false, false, true),
  ('mobile_qr_login', 'Mobile QR Login', 'Mobile-based QR login workflows with enrollment controls.', 0, 0, 0, false, true, true),
  ('mobile_device_enrollment', 'Mobile Device Enrollment', 'Activation token and mobile device enrollment workflows.', 0, 0, 0, false, true, true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  default_monthly_price = excluded.default_monthly_price,
  default_yearly_price = excluded.default_yearly_price,
  default_perpetual_price = excluded.default_perpetual_price,
  included_by_default = excluded.included_by_default,
  priced_per_branch = excluded.priced_per_branch,
  is_active = excluded.is_active,
  updated_at = now();

with package_matrix(code, name, monthly_price, yearly_price, max_branches, max_devices, max_users, metadata) as (
  values
    ('solo', 'Solo Register', 350::numeric, 3850::numeric, 1, 1, 3, '{"target":"small shop / single register","login_mode":"single_register","branch_selection":"hidden","max_cashier_devices":1,"monthly_new_customer_discount_percent":10,"monthly_new_customer_discount_months":3,"yearly_free_months":1}'::jsonb),
    ('starter', 'Starter', 690::numeric, 7590::numeric, 1, 2, 5, '{"target":"affordable starter package","monthly_new_customer_discount_percent":10,"monthly_new_customer_discount_months":3,"yearly_free_months":1}'::jsonb),
    ('growth', 'Growth', 1290::numeric, 14190::numeric, 2, 2, 10, '{"target":"multi-terminal / multi-branch growth","max_devices_per_branch":2,"monthly_new_customer_discount_percent":10,"monthly_new_customer_discount_months":3,"yearly_free_months":1}'::jsonb),
    ('enterprise', 'Enterprise', 2490::numeric, 27390::numeric, 5, 4, 30, '{"target":"full restaurant/store expansion package","max_devices_per_branch":4,"monthly_new_customer_discount_percent":10,"monthly_new_customer_discount_months":3,"yearly_free_months":1}'::jsonb)
)
insert into subscription_packages (code, name, monthly_price, yearly_price, max_branches, max_devices, max_users, is_active, status, metadata)
select code, name, monthly_price, yearly_price, max_branches, max_devices, max_users, true, 'active', metadata
from package_matrix
on conflict (code) do update
set
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  max_branches = excluded.max_branches,
  max_devices = excluded.max_devices,
  max_users = excluded.max_users,
  is_active = excluded.is_active,
  status = excluded.status,
  metadata = coalesce(subscription_packages.metadata, '{}'::jsonb) || excluded.metadata;

with package_features(package_code, feature_code) as (
  values
    ('solo', 'core_pos_sales'),
    ('solo', 'advanced_sales_reports'),
    ('solo', 'receipt_reprint_history'),
    ('solo', 'pin_login'),
    ('solo', 'user_management'),
    ('solo', 'device_management'),
    ('starter', 'core_pos_sales'),
    ('starter', 'stock_management'),
    ('starter', 'delivery_ordering'),
    ('starter', 'advanced_sales_reports'),
    ('starter', 'receipt_reprint_history'),
    ('starter', 'qr_login'),
    ('starter', 'mobile_qr_login'),
    ('starter', 'device_management'),
    ('growth', 'core_pos_sales'),
    ('growth', 'stock_management'),
    ('growth', 'delivery_ordering'),
    ('growth', 'multi_terminal_sync'),
    ('growth', 'offline_queue_resilience'),
    ('growth', 'advanced_sales_reports'),
    ('growth', 'receipt_reprint_history'),
    ('growth', 'branch_management'),
    ('growth', 'user_management'),
    ('enterprise', 'core_pos_sales'),
    ('enterprise', 'stock_management'),
    ('enterprise', 'delivery_ordering'),
    ('enterprise', 'advanced_sales_reports'),
    ('enterprise', 'receipt_reprint_history'),
    ('enterprise', 'table_management'),
    ('enterprise', 'qr_table_ordering'),
    ('enterprise', 'kitchen_printing'),
    ('enterprise', 'customer_facing_display'),
    ('enterprise', 'inet_nops_qr'),
    ('enterprise', 'staff_card_login'),
    ('enterprise', 'mobile_device_enrollment')
)
insert into subscription_package_features (package_id, feature_code, included)
select p.id, pf.feature_code, true
from package_features pf
join subscription_packages p on p.code = pf.package_code
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
  and spf.feature_code in ('attendance_tracking', 'stock_management', 'table_management', 'qr_table_ordering', 'delivery_ordering', 'customer_facing_display', 'inet_nops_qr', 'mobile_device_enrollment', 'branch_management')
  and spf.included = true;
