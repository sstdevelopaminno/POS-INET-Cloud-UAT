# Bluetooth Bridge API Response Spec

Date: 2026-05-25

All Bluetooth bridge-facing endpoints now return a normalized envelope in `data`:

```json
{
  "data": {
    "ok": true,
    "code": "bluetooth_discover_ok",
    "message": "Bluetooth discovery completed.",
    "action": "discover_bluetooth_printers",
    "timestamp": "2026-05-25T00:00:00.000Z",
    "data": {}
  },
  "error": null
}
```

## Actions
- `health`
- `discover_bluetooth_printers`
- `connect_bluetooth_printer`
- `print`

## Endpoints
- `POST /api/backoffice/printers/bluetooth/health`
- `POST /api/backoffice/printers/bluetooth/discover`
- `POST /api/backoffice/printers/bluetooth/connect`
- `POST /api/pos/receipts/bluetooth`

## Print Fallback Contract
For `print`, when bridge/printer is unavailable, API returns HTTP `200` with:

```json
{
  "ok": false,
  "code": "bluetooth_bridge_request_failed",
  "action": "print",
  "data": {
    "fallback_to_browser_print": true,
    "jobs": []
  }
}
```

Client should continue with HTML iframe browser print fallback.

