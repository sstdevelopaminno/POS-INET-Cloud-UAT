# iPad Printing Guide (POS)

Date: 2026-05-18

## Why iPad Needs Special Planning
iOS Safari/PWA has limited direct USB/Bluetooth thermal printer access.  
For restaurant-grade reliability, avoid relying on direct browser-to-printer USB/Bluetooth flows.

## Recommended Setup Priority
1. `NETWORK_ESC_POS` over LAN/Wi-Fi
- Best default for stable POS operation.
- Configure static printer IP and keep printer on same reliable subnet.

2. `STAR_WEBPRNT` for Star-compatible environments
- Use Star-compatible endpoint integration.
- Good option when iPad-centric deployment already uses Star hardware.

3. `LOCAL_BRIDGE` when cashier PC is available
- iPad sends order flow normally.
- Print command is bridged via local helper (for USB printer on cashier machine).

4. `BLUETOOTH_BRIDGE` when bridge host controls Bluetooth printer
- iPad web flow sends print job to bridge endpoint.
- Bridge service is responsible for Bluetooth pairing/connection and write-to-printer.
- Metadata requires `bluetooth_address` (or `bluetooth_name`) plus `bridge_url`.

## Practical Checklist
1. Reserve printer IP (DHCP reservation or static IP).
2. Set firewall/network rules so POS runtime can reach printer port (usually `9100`).
3. Configure printer in `/backoffice/settings/printers`.
4. Run `Test print` from settings page before opening shift.
5. Monitor failed jobs and reprint from order screen when needed.

## Failure Behavior (By Design)
- Payment/order remains successful even if print fails.
- Failed print is tracked in queue with `last_error`.
- Staff/manager can trigger reprint without redoing payment.

## Store-Type Suggestions
- iPad-only store: `STAR_WEBPRNT` or `NETWORK_ESC_POS`.
- Android-heavy store: use native Android options (outside this step).
- Store with cashier PC + USB 58mm printer: use `LOCAL_BRIDGE` (QZ Tray/helper).
- Store with cashier PC + Bluetooth thermal printer: use `BLUETOOTH_BRIDGE` via local bridge service.
