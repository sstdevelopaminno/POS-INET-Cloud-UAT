# Table Management & Floor Plan

## Scope
- Multi-tenant table/zone setup for back office.
- POS dine-in table selector with two modes:
1. Sorted list/grid
2. Floor plan canvas (pan/zoom + visual table nodes)

## New Database Objects
- `table_zones`
- `dining_tables`
- `table_bill_sessions`
- `table_layout_objects` (movable floor-plan assets: counter/cashier/partition/etc.)

Migration file:
- `supabase/migrations/202605190001_table_management_floor_plan.sql`
- `supabase/migrations/202605190002_floor_plan_objects.sql`

Highlights:
- Added `approval_action` enum value: `table_move_bill`
- Migrates legacy `dine_in_tables` rows into `dining_tables`
- Re-points `orders.table_id` foreign key to `dining_tables`
- Adds RLS + updated_at triggers + indexes for table workflows

## Table Statuses
- `available` (green)
- `occupied` (orange)
- `ordering` (blue)
- `pending_payment` (red)
- `reserved` (purple)
- `disabled` (gray)

Status handling:
- Base setup status is stored on `dining_tables.status`.
- Active session state from `table_bill_sessions` is used to derive effective POS status.

## API Endpoints

Back Office:
- `GET/POST /api/backoffice/tables`
- `PATCH/DELETE /api/backoffice/tables/[tableId]`
- `GET/POST /api/backoffice/table-zones`
- `PATCH/DELETE /api/backoffice/table-zones/[zoneId]`
- `GET/POST /api/backoffice/table-layout-objects`
- `PATCH/DELETE /api/backoffice/table-layout-objects/[objectId]`
- `POST /api/backoffice/tables/floor-plan/save`

POS:
- `GET /api/pos/tables`
- `POST /api/pos/tables/[tableId]/open-bill`
- `GET /api/pos/tables/[tableId]/bill`
- `POST /api/pos/tables/[tableId]/move-bill` (manager approval required)

## Permission Rules
- Staff can use POS table/bill actions.
- Staff cannot create/update/delete table or zone setup.
- Only manager/owner can manage table/zone setup and save floor plan.
- Bill move requires manager approval (`approval_action = table_move_bill`).
- Bill cancel remains approval-gated in existing cancel endpoint.

## Audit Logs
Important actions now write audit logs:
- `table_created`
- `table_updated`
- `table_deleted`
- `floor_plan_updated`
- `bill_opened_from_table`
- `table_changed`
- `table_bill_cancelled`

## UI Components
- `TableManagementPage`
- `TableZoneTabs`
- `TableListGrid`
- `TableCard`
- `FloorPlanCanvas`
- `FloorPlanToolbar`
- `DraggableTableNode`
- `TableStatusBadge`
- `TableOpenBillModal`
- `TableBillSummaryPanel`

## Routes
- Back office management:
  - `/settings/tables`
  - `/backoffice/settings/tables` (alias)
- POS dine-in integration:
  - integrated into existing `/pos/sales` flow without removing takeaway/delivery modes
