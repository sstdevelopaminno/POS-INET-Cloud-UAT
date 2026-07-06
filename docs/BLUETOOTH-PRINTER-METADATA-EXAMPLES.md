# Bluetooth Printer Metadata Examples

Date: 2026-05-25

Use these examples in `/backoffice/settings/printers` when `connection_type = BLUETOOTH_BRIDGE`.

## Required Fields
- `bridge_url`: URL of local print bridge on cashier machine.
- Bluetooth target:
  - `bluetooth_address` (recommended), or
  - `bluetooth_name`
- `auto_connect`: set `true` to force reconnect before each print job.

## Example 1: MAC Address Target (Recommended)
```json
{
  "bridge_url": "http://127.0.0.1:3210/print",
  "bluetooth_address": "AA:BB:CC:DD:EE:FF",
  "auto_connect": true,
  "connect_before_print": true,
  "prefer_html_58mm": true
}
```

## Example 2: Device Name Target
```json
{
  "bridge_url": "http://127.0.0.1:3210/print",
  "bluetooth_name": "MTP-II",
  "auto_connect": true
}
```

## Example 3: Alternative Address Keys (Backward Compatibility)
```json
{
  "bridge_url": "http://127.0.0.1:3210/print",
  "bluetooth_mac": "AA:BB:CC:DD:EE:FF"
}
```

## Environment Fallback
If `bridge_url` is not set in metadata, system reads:
1. `PRINT_BLUETOOTH_BRIDGE_URL`
2. `PRINT_BRIDGE_URL`
