# INET NOPS UAT cURL Details For INET Support

Date: 2026-06-26

This note is safe to send to INET support. Secret values are intentionally redacted.

## Current Issue

The POS server can reach the INET UAT OAuth and access-token steps, but the final create-payment request fails:

```text
inet_nops_create_payment_http_403:html_response
```

Meaning: the dynamic create-payment link returned by INET responds with HTTP 403 and an HTML page instead of the expected JSON payload.

Please confirm:

1. Whether this UAT Merchant Key is enabled for QR create-payment.
2. Whether INET requires IP/domain allowlisting for server-side requests from Vercel.
3. Whether the final create-payment call must use `POST` JSON body `{ "accessToken": "..." }`, or a different method/header/body.
4. Whether the `apUrl` domain must be registered/approved before create-payment is allowed.

## Public POS URLs

```text
Result page / apUrl:
https://sstipos-ten.vercel.app/payment/inet/result

Server-to-server callback URL:
https://sstipos-ten.vercel.app/api/payments/inet/callback
```

## Step 1: OAuth

Method: `POST`

URL:

```text
https://new-ops-poc.inet.co.th/uat/oauth/api/v1/oauth-token
```

cURL:

```bash
curl -i -X POST "https://new-ops-poc.inet.co.th/uat/oauth/api/v1/oauth-token" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  --data '{
    "key": "<INET_UAT_MERCHANT_KEY>",
    "orderId": "SST260626110606ABCDEF123456789"
  }'
```

Expected response:

```json
{
  "code": 201,
  "token": "<OAUTH_TOKEN>"
}
```

The POS also accepts token fields named `access_token`, `oauthToken`, or `oauth_token`.

## Step 2: Access Token

Method: `POST`

URL:

```text
https://new-ops-poc.inet.co.th/uat/api/v1/sandbox/payment-transactions/access-token
```

cURL:

```bash
curl -i -X POST "https://new-ops-poc.inet.co.th/uat/api/v1/sandbox/payment-transactions/access-token" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <OAUTH_TOKEN>" \
  --data '{
    "key": "<INET_UAT_MERCHANT_KEY>",
    "orderId": "SST260626110606ABCDEF123456789",
    "orderDesc": "POS TEST-BILL",
    "amount": 125,
    "apUrl": "https://sstipos-ten.vercel.app/payment/inet/result",
    "payType": "QR",
    "regRef": ""
  }'
```

Expected response:

```json
{
  "code": 201,
  "accessToken": "<PAYMENT_ACCESS_TOKEN>",
  "link": "<CREATE_PAYMENT_LINK>"
}
```

The POS also accepts access-token fields named `access_token`, and link fields named `paymentUrl` or `payment_url`.

## Step 3: Create Payment

Method currently used by POS: `POST`

URL:

```text
<CREATE_PAYMENT_LINK returned from Step 2>
```

cURL:

```bash
curl -i -X POST "<CREATE_PAYMENT_LINK>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  --data '{
    "accessToken": "<PAYMENT_ACCESS_TOKEN>"
  }'
```

Expected response:

```json
{
  "code": 200,
  "qrCode": "<BASE64_QR_IMAGE>"
}
```

The POS also accepts QR fields named `qr_code`, `qrcode`, or `qr`.

Actual current result:

```text
HTTP 403
Content-Type: text/html
```

## POS Order ID Format

The POS generates a 30-character provider order ID:

```text
SST + YYMMDDHHMMSS + 15 random uppercase hex characters
```

Example:

```text
SST260626110606ABCDEF123456789
```

## Notes

- Merchant Key is server-only and is never sent to the browser.
- The POS UAT connection-test button only tests OAuth. QR creation requires all three steps above.
- The bill closes automatically only after INET sends a successful server-to-server callback with `payment_status_change` and `detail.response_code = 0`.
