# POS Preview Solo Register Release - 2026-06-28

## Scope

This release prepares POS Preview for a single-register shop that does not expose branch selection to the cashier.

Included work:

- Fixed shift-close session handling so close-shift can complete even after the POS session status changes during close.
- Reduced repeated `/api/pos/session/current` calls from the shift-cycle guard.
- Added the `solo` / `Solo Register` package to the subscription catalog.
- Synced local migration history with the remote Supabase project so INET migrations are not pushed twice.
- Applied remote migration `20260628101753_solo_single_register_package`.
- Seeded the live demo store for solo login testing.

## Demo Login

- Store code: `SOLO-TH-001`
- Device: `SOLO-POS-01`
- Owner: `900001` / PIN `111111`
- Manager: `900002` / PIN `222222`
- Staff: `900003` / PIN `333333`

The demo store uses one internal branch (`MAIN`) and one active POS device. Browser requests to `/api/pos/session/current` will still return `401` until the user completes the POS login flow and receives a POS session cookie.

## Remote DB Verification

Verified on the linked Supabase project:

- Package `solo` exists as `Solo Register`.
- Package limits are 1 branch, 1 device, and 3 users.
- Original 2026-06-28 enabled features were `core_pos_sales`, `pin_login`, `attendance_tracking`, `user_management`, and `device_management`.
- Demo tenant `SOLO-TH-001` exists with branch `MAIN` and device `SOLO-POS-01`.
- Employee codes `900001`, `900002`, and `900003` are bound to owner, manager, and staff roles.
- PIN hashes verified for `111111`, `222222`, and `333333`.
- No active POS session was left on the demo device after seeding.

## 2026-06-29 Package Lock Update

This update supersedes the original Solo feature list in code, seed data, and migrations. It also adds frontend guards so disabled package features do not silently fail.

Code/catalog state:

- Prices: Solo 350/month and 3,850/year; Starter 690/month and 7,590/year; Growth 1,290/month and 14,190/year; Enterprise 2,490/month and 27,390/year.
- Promotions: monthly customers receive 10% discount for the first 3 months; yearly billing pays 11 months and gets 1 month free.
- Limits: Solo 1 branch, 1 device, 3 users; Starter 1 branch, 2 devices, 5 users; Growth 2 branches, 2 devices per branch, 10 users; Enterprise 5 branches, 4 devices per branch, 30 users.
- Solo POS main menu allowed: sales screen in takeaway mode only, sales list, sales summary, receipt history.
- Solo settings menu allowed: payment settings, store/company profile, tax settings, users, usage behavior audit.
- Solo locked features now show the package-lock popup instead of a browser alert.
- Receipt/logo fallback: if a store has no valid logo or the logo image fails to load, the system logo `/brand/sst-ipos-logo-new.png` is used.

Current package feature matrix in `apps/backoffice-web/src/lib/subscription-catalog.ts`:

| Package | Included feature codes |
| --- | --- |
| Solo Register | `core_pos_sales`, `advanced_sales_reports`, `receipt_reprint_history`, `pin_login`, `user_management`, `device_management` |
| Starter | `core_pos_sales`, `stock_management`, `delivery_ordering`, `advanced_sales_reports`, `receipt_reprint_history`, `qr_login`, `mobile_qr_login`, `device_management` |
| Growth | `core_pos_sales`, `stock_management`, `delivery_ordering`, `multi_terminal_sync`, `offline_queue_resilience`, `advanced_sales_reports`, `receipt_reprint_history`, `branch_management`, `user_management` |
| Enterprise | `core_pos_sales`, `stock_management`, `delivery_ordering`, `advanced_sales_reports`, `receipt_reprint_history`, `table_management`, `qr_table_ordering`, `kitchen_printing`, `customer_facing_display`, `inet_nops_qr`, `staff_card_login`, `mobile_device_enrollment` |

Feature catalog codes available for package/default/override use:

- Sales and checkout: `core_pos_sales`, `advanced_sales_reports`, `receipt_reprint_history`, `transfer_slip_verification`.
- Inventory and product setup: `stock_management`, `barcode_scanner_mode`.
- Dine-in/table flow: `table_management`, `qr_table_ordering`, `kitchen_printing`.
- Delivery/customer display: `delivery_ordering`, `customer_facing_display`.
- Login/device/branch/user: `pin_login`, `qr_login`, `mobile_qr_login`, `staff_card_login`, `device_management`, `mobile_device_enrollment`, `branch_management`, `user_management`.
- Operations/add-ons: `multi_terminal_sync`, `offline_queue_resilience`, `desktop_app_runtime`, `staff_qr_clockin`, `attendance_tracking`, `inet_nops_qr`.

403 observation from POS console:

- `POST /api/pos/customer-display 403` is expected when `customer_facing_display` is disabled for the package.
- `GET/POST /api/pos/tables 403` is expected when `table_management` is disabled for the package.
- The frontend was adjusted to avoid publishing customer-display payloads unless `customer_facing_display` is enabled, and to avoid bootstrapping table layout on POS sales load. Table APIs are still called when a user enters an enabled dine-in/table flow.

## Notes

- Do not commit Supabase access tokens or database passwords. Use environment variables only.
- `scripts/apply-solo-demo-seed.sql` is idempotent and can be rerun if the demo store needs to be repaired.
- `supabase/seed.sql` was adjusted to match the current remote `branch_login_policies` schema.
