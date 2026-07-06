# INET NOPS UAT Test

Source documents: `NEW_OPS_API_V.2.pdf` and `Callback Server to Server (QRCode & Other) V.2.pdf`, supplied by INET on 2026-06-23.

## What the UAT Proves

The INET sandbox can create a base64 QR image without taking a real payment. INET's documented sandbox confirmation action, `Complete Transactions`, sends `payment_status_change` with `detail.response_code = 0` to the registered callback URL. The POS then detects the paid intent and clears the bill automatically; the cashier does not press a confirmation button.

Do not use a consumer banking app to attempt a real transfer during this UAT. Displaying and visually scanning the QR is safe for UI verification, but the sandbox confirmation action is the supported way to trigger the payment-success callback without money movement.

## Required Setup

1. Apply `supabase/migrations/20260623152235_inet_nops_payment_provider.sql`.
2. Set `INET_NOPS_MERCHANT_KEY_UAT` in `apps/backoffice-web/.env.local` or the UAT host's secret manager. INET's onboarding email may not include a merchant ID; in that documented UAT-only case set `INET_NOPS_ALLOW_MISSING_MERCHANT_ID_UAT=true`. Do not use that flag in production.
3. Set both UAT URLs to a public HTTPS host. `localhost` is suitable only for rendering the QR, not for INET callbacks.
   - `INET_NOPS_AP_URL_UAT=https://uat.example.com/payment/inet/result` (implemented by `src/app/payment/inet/result/page.tsx`)
   - `INET_NOPS_CALLBACK_PUBLIC_URL=https://uat.example.com/api/payments/inet/callback`
4. Email the public callback URL to `tdcp@inet.co.th` as requested in INET's callback document.
5. Enable the provider for the target tenant and branch in `pos_payment_provider_settings` with `provider='inet_nops'`, `environment='uat'`, the merchant ID, and `is_active=true`.

## UAT Flow

1. Open a shift and create a POS order above 0.01 THB.
2. Select transfer payment, choose `INET NOPS QR`, and create the QR.
3. Confirm the QR is rendered. The API sequence is OAuth (`201`) -> access token (`201`) -> create payment (`200`).
4. In the INET sandbox payment page, use `Complete Transactions`.
5. Confirm INET sends a `200`-acknowledged callback with `event=payment_status_change`, the generated `order_id`, matching merchant ID, matching amount, and `response_code=0`.
6. Within the POS status polling interval, confirm the transfer modal closes, the cart/bill clears, the receipt state is created, and the order becomes completed. No cashier confirmation is required.
7. Re-send the same callback once. Confirm it returns HTTP 200 as `duplicate` and creates no second payment or print job.

## Callback Safety

The endpoint resolves tenant and branch only from the stored payment intent. It accepts only INET's documented success/failure codes (`0` and `1`), verifies the merchant ID and amount, stores a redacted callback log, and does not retain optional payer account/card details. Invalid callbacks leave the pending payment untouched for reconciliation.

For a success callback, the endpoint atomically claims the pending payment intent before it finalizes the POS bill. A simultaneous retry that cannot acquire that claim returns HTTP 200 as `duplicate`, preventing duplicate receipt/print side effects. If finalization fails, the claim is released and the endpoint returns HTTP 500 so INET can retry.
