# Printer Architecture (POS Platform)

Date: 2026-05-18

## Objectives
- Decouple POS business logic from printer brand and connection method.
- Keep payment success independent from print success.
- Support production-safe queue, retry, and reprint flows.
- Maintain compatibility with POS Web/PWA, Android APK integration, and future iOS app.

## Supported Print Modes
1. `NETWORK_ESC_POS` (recommended production mode)
- Sends ESC/POS payload over LAN/Wi-Fi by printer IP + port (default `9100`).

2. `STAR_WEBPRNT`
- Adapter interface ready for Star Micronics WebPRNT compatible endpoints.
- Uses adapter metadata (`webprnt_url`) for integration endpoint.

3. `LOCAL_BRIDGE`
- Adapter interface for desktop/bridge runtimes such as QZ Tray or helper agents.
- Uses `metadata.bridge_url` (or `PRINT_BRIDGE_URL`) to forward print payload for USB printers.

4. `BLUETOOTH_BRIDGE`
- Adapter interface for Bluetooth printers routed through a local bridge service.
- Requires printer target in metadata:
  - `bluetooth_address` (recommended) or `bluetooth_name`
- Uses `metadata.bridge_url` or env `PRINT_BLUETOOTH_BRIDGE_URL` (fallback `PRINT_BRIDGE_URL`).

## Core Components
- `apps/backoffice-web/src/lib/printing/print-service.ts`
  - queue creation
  - retry lifecycle (`pending` -> `printing` -> `retrying` -> `printed|failed`)
  - receipt/kitchen template rendering
  - reprint behavior

- `apps/backoffice-web/src/lib/printing/adapters/network-escpos-adapter.ts`
- `apps/backoffice-web/src/lib/printing/adapters/star-webprnt-adapter.ts`
- `apps/backoffice-web/src/lib/printing/adapters/local-bridge-adapter.ts`
- `apps/backoffice-web/src/lib/printing/adapters/bluetooth-bridge-adapter.ts`

## Data Model
Migration: `supabase/migrations/202605180002_printer_architecture.sql`

### `printer_profiles`
- `tenant_id`, `branch_id`
- `printer_name`
- `printer_role` (`receipt | kitchen | report`)
- `connection_type` (`NETWORK_ESC_POS | STAR_WEBPRNT | LOCAL_BRIDGE | BLUETOOTH_BRIDGE`)
- `ip_address`, `port`
- `paper_width_mm` (`58 | 80`)
- `enabled`
- `metadata`

### `print_jobs`
- `status` (`pending | printing | printed | failed | retrying`)
- retry fields: `retry_count`, `max_retry_count`, `last_error`
- timestamps: `printed_at`, `failed_at`
- linkage: `order_id`, `printer_id`

## API Endpoints
- `GET /api/backoffice/printers`
- `POST /api/backoffice/printers`
- `POST /api/backoffice/printers/test`
- `POST /api/backoffice/printers/bluetooth/health`
- `POST /api/backoffice/printers/bluetooth/discover`
- `POST /api/backoffice/printers/bluetooth/connect`
- `POST /api/backoffice/orders/[orderId]/reprint`
- `POST /api/pos/receipts/bluetooth` (send HTML 58mm receipt to BLUETOOTH_BRIDGE printers)

## Backoffice UI
- Route: `/backoffice/settings/printers`
- Capabilities:
  - add printer
  - assign role (`receipt/kitchen/report`)
  - select connection type
  - select paper width (`58/80`)
  - run test print

## Payment and Print Contract
- Payment/order success is returned even when printer fails.
- Print failures are recorded in `print_jobs` as `failed` with `last_error`.
- Reprint does one of:
  1. retry latest failed receipt job
  2. create a new receipt print job when no failed job exists

## Operational Recommendation
- iPad/iOS stores: prioritize `STAR_WEBPRNT` or `NETWORK_ESC_POS`.
- Android stores: use APK bridge support for Bluetooth/Wi-Fi/USB.
- Counter-PC stores: use `LOCAL_BRIDGE` (QZ Tray/helper) for USB 58mm printers.
- Bluetooth thermal printers (desktop bridge): use `BLUETOOTH_BRIDGE` with bridge URL and MAC/name target metadata.
