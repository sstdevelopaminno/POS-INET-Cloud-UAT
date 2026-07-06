# INET NOPS QR Operations Manual

Date: 2026-06-25

This guide records how INET NOPS QR is wired into the POS sales screen, how to test UAT, and when to switch to production credentials. It is based on the current POS code plus the INET `NEW_OPS_API_V.2.pdf` and `Callback Server to Server (QRCode & Other) V.2.pdf` contract notes already captured in this repository.

## Core Rule

INET QR is an optional provider for transfer payments. It does not replace the existing manual PromptPay/static QR flow.

When INET QR is enabled for the current branch, the transfer payment popup shows two choices:

- `Manual QR`: uses the existing PromptPay/static QR account and requires the cashier to confirm the transfer.
- `INET QR`: creates a new amount-bound INET QR for this bill and waits for INET's server-to-server callback.

## Required Setup

1. Apply the INET migrations:
   - `supabase/migrations/20260623152235_inet_nops_payment_provider.sql`
   - `supabase/migrations/20260623174225_inet_nops_settings_feature.sql`
2. Enable the branch/package feature code `inet_nops_qr`.
3. Put credentials in server environment variables only. Never put Merchant Key values in browser state, README examples, or `NEXT_PUBLIC_*` variables.
4. Restart or redeploy the server after changing INET environment variables.
5. Open POS settings, go to `INET QR`, choose branch, select UAT or Production, tick `Enable INET QR`, and save.
6. Reload the POS sales page so `/api/pos/sales` returns the latest `payment_providers.inet_nops` snapshot.

## UAT Environment

Use UAT while testing the temporary sandbox key:

```env
INET_NOPS_ENV=uat
INET_NOPS_MERCHANT_KEY_UAT=<server-only UAT key>
INET_NOPS_MERCHANT_ID_UAT=
INET_NOPS_ALLOW_MISSING_MERCHANT_ID_UAT=true
INET_NOPS_OAUTH_URL_UAT=<INET UAT OAuth URL>
INET_NOPS_ACCESS_TOKEN_URL_UAT=<INET UAT access-token URL>
INET_NOPS_AP_URL_UAT=<public result page URL>
INET_NOPS_CALLBACK_PUBLIC_URL=<public callback URL>
```

`localhost` can render a QR locally, but INET cannot call back to it. For automatic paid-status testing, `INET_NOPS_CALLBACK_PUBLIC_URL` must be a public HTTPS URL and must be registered with INET.

## Production Switch

Switch to production only after UAT succeeds and INET sends real receiving-payment credentials.

```env
INET_NOPS_ENV=production
INET_NOPS_MERCHANT_KEY_PROD=<server-only production key>
INET_NOPS_MERCHANT_ID_PROD=<production merchant ID>
INET_NOPS_OAUTH_URL_PROD=<INET production OAuth URL>
INET_NOPS_ACCESS_TOKEN_URL_PROD=<INET production access-token URL>
INET_NOPS_AP_URL_PROD=<public production result page URL>
INET_NOPS_CALLBACK_PUBLIC_URL_PROD=<public production callback URL>
```

Production always requires a Merchant ID. Do not copy the UAT key into the production key.

## Sales Screen Behavior

The POS sales snapshot controls whether the transfer popup shows INET:

- `/api/pos/sales` checks the `inet_nops_qr` feature and active row in `pos_payment_provider_settings`.
- The browser only receives minimal provider state: active or inactive plus environment. It never receives the Merchant Key.
- The transfer popup shows the `Manual QR` / `INET QR` selector only when `paymentProviders.inet_nops.is_active === true`.

Current mode coverage:

| POS mode | INET QR behavior |
| --- | --- |
| Takeaway / home sales | Supported through the normal review bill -> transfer payment popup. |
| Dine-in table bill | Supported through the same transfer popup. On paid callback, the table bill session is closed and the table is made available by the server finalization flow. |
| Delivery manual order through the normal bill review popup | Supported if the order reaches the normal review bill -> transfer popup. |
| Delivery pending-bill quick send | Does not show the QR selector. This path creates and pays the delivery order as a direct `bank_transfer` using the delivery reference, so it does not create an INET QR. |
| Cash payment | Not affected by INET QR. |

## INET QR Payment Flow

1. Cashier creates or opens a bill.
2. Cashier chooses transfer payment.
3. If INET is active, the popup shows `Manual QR` and `INET QR`.
4. Cashier selects `INET QR`.
5. Cashier presses `Create INET QR`.
6. The POS calls `POST /api/pos/payments/inet/qr` with only `order_id`.
7. The server resolves tenant, branch, order, amount, shift, provider settings, Merchant ID, and Merchant Key.
8. The server creates a pending row in `pos_payment_intents`.
9. The server calls INET:
   - OAuth request, expected code `201`
   - Access-token request, expected code `201`
   - Create-payment request, expected code `200`
10. The popup renders the QR returned by INET and polls `GET /api/pos/payments/inet/status`.
11. Cashier does not press the manual transfer confirmation button for INET QR.

## Callback And Bill Closing

INET sends payment results to:

```text
POST /api/payments/inet/callback
```

The callback handler:

- accepts `event=payment_status_change`
- resolves tenant and branch only from `pos_payment_intents.provider_order_id`
- validates Merchant ID when available
- validates callback amount against the stored payment intent amount
- treats `detail.response_code = 0` as success
- treats `detail.response_code = 1` as failed payment
- logs invalid or mismatched callbacks without mutating the pending payment
- returns HTTP 200 for duplicate or validation-failed business cases so INET does not retry forever

On `response_code = 0`, the server finalizes the POS payment as `bank_transfer` with a reference like:

```text
INET:<payment_reference_id-or-provider-order-id>
```

Then the POS polling detects the intent status as `paid`, closes the transfer popup, clears the cart/order state, sets receipt state, and shows a saved receipt. The cashier does not need to click `Confirm transfer`.

## Test Checklist

1. Restart/redeploy after putting the UAT Merchant Key in server env.
2. In POS settings, confirm Merchant Key status is configured.
3. Save INET QR as active for the target branch.
4. Reload `/preview/pos`.
5. Create an order above 0.01 THB.
6. Open transfer payment.
7. Confirm the selector shows `Manual QR` and `INET QR`.
8. Select `Manual QR` and confirm the old QR still appears.
9. Select `INET QR`, create QR, and confirm the QR plus INET reference appear.
10. Use INET sandbox `Complete Transactions` for UAT success.
11. Confirm the callback is accepted and the bill closes automatically.
12. Confirm duplicate callbacks return duplicate success and do not create a second payment.

## Troubleshooting

If the POS does not show INET:

- Confirm the branch feature `inet_nops_qr` is enabled.
- Confirm `pos_payment_provider_settings` has `provider='inet_nops'`, the correct `branch_id`, and `is_active=true`.
- Confirm server runtime has `INET_NOPS_MERCHANT_KEY_UAT` or `INET_NOPS_MERCHANT_KEY_PROD`.
- Restart or redeploy after env changes.
- Reload the POS sales page after saving settings.

If QR creation works but the bill does not close:

- Confirm the callback URL is public HTTPS, not localhost.
- Confirm INET registered the same callback URL.
- Confirm callback amount and Merchant ID match the stored payment intent.
- Check `pos_payment_callback_logs` for `validation_failed`, `duplicate`, or `error`.
- Check `pos_payment_intents.status` for `pending`, `paid`, or `failed`.
