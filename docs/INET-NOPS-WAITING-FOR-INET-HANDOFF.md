# INET NOPS QR Handoff While Waiting For INET

Date: 2026-06-26
Project: POS Preview / SST iPOS
Branch: `feature/inet-nops-callback`

## Current Status

The INET QR feature is implemented and deployed, but UAT QR creation is blocked by INET's create-payment step.

Latest pushed/deployed commits:

- `179df96` - Auto-create INET QR on mode select
- `df9b076` - Improve INET QR sales error handling
- `47deedb` - Ignore local Codex artifacts

Production URL:

```text
https://sstipos-ten.vercel.app
```

Latest confirmed production deployment after auto-create change:

```text
dpl_7t38NTU3zqwuTrW83iKRgN7TaGKM
```

## What Works

- INET QR settings panel is available under POS settings.
- UAT Merchant Key is configured in Vercel production env.
- UAT fallback without Merchant ID is enabled for sandbox testing.
- UAT OAuth connection test passes.
- POS sales transfer popup shows `Manual QR` and `INET QR` as separate modes.
- Selecting `INET QR` now auto-starts QR creation.
- Manual PromptPay/static QR flow remains available and separate.
- INET callback endpoint is implemented:

```text
https://sstipos-ten.vercel.app/api/payments/inet/callback
```

## Current Blocker

When creating an INET QR from the POS sales screen, the POS reaches INET's final create-payment step and receives:

```text
inet_nops_create_payment_http_403:html_response
```

Interpretation:

- Step 1 OAuth is reachable.
- Step 2 access-token is reachable.
- Step 3 create-payment link returned by INET responds with HTTP 403 and an HTML page instead of JSON.
- Because Step 3 fails, INET does not return `qrCode`, so the POS cannot render the QR image yet.

This is currently waiting for INET confirmation.

## Information Sent To INET

The cURL/body/path package for INET support is saved here:

- `docs/INET-NOPS-CURL-FOR-INET.txt`
- `docs/INET-NOPS-CURL-FOR-INET.pdf`
- `docs/INET-NOPS-CURL-FOR-INET.md`
- `docs/INET-NOPS-CURL-FOR-INET.html`

Primary file to send:

```text
docs/INET-NOPS-CURL-FOR-INET.txt
```

PDF version:

```text
docs/INET-NOPS-CURL-FOR-INET.pdf
```

Questions for INET:

1. Is the UAT Merchant Key enabled for QR create-payment?
2. Is IP/domain allowlisting required for Vercel server-side requests?
3. Is Step 3 supposed to be `POST <CREATE_PAYMENT_LINK>` with JSON body `{ "accessToken": "..." }`?
4. Does `apUrl` need to be registered/approved before create-payment is allowed?

## Public URLs To Confirm With INET

Result page / `apUrl`:

```text
https://sstipos-ten.vercel.app/payment/inet/result
```

Server-to-server callback URL:

```text
https://sstipos-ten.vercel.app/api/payments/inet/callback
```

## Where To Resume

After INET replies, resume from these files:

- `apps/backoffice-web/src/lib/payments/inet-nops-client.ts`
- `apps/backoffice-web/src/app/api/pos/payments/inet/qr/route.ts`
- `apps/backoffice-web/src/app/api/payments/inet/callback/route.ts`
- `apps/backoffice-web/src/components/pos/pos-sales-module.tsx`
- `apps/backoffice-web/src/components/pos/pos-payment-modals.tsx`
- `apps/backoffice-web/src/components/pos-preview/inet-nops-settings-panel.tsx`

If INET says Step 3 requires a different method/header/body, update `postJson()` or the create-payment call in:

```text
apps/backoffice-web/src/lib/payments/inet-nops-client.ts
```

If INET says IP/domain allowlisting is required, provide them with:

```text
https://sstipos-ten.vercel.app
```

and ask whether Vercel outbound IP allowlisting is supported for this UAT endpoint or if they need a fixed outbound proxy.

## Verification Already Run

- `npm run typecheck` passed after the latest INET QR UI/flow changes.
- `git diff --check` passed with only expected Windows CRLF warnings.
- Vercel production build completed successfully.

Lint note:

- `npm run lint` was attempted after the error-handling/UI change but timed out after 5 minutes without emitting an error.

## Repo State At Pause

Expected local untracked docs before final commit:

```text
docs/INET-NOPS-CURL-FOR-INET.html
docs/INET-NOPS-CURL-FOR-INET.md
docs/INET-NOPS-CURL-FOR-INET.pdf
docs/INET-NOPS-CURL-FOR-INET.txt
docs/INET-NOPS-WAITING-FOR-INET-HANDOFF.md
```

No runtime code changes are expected after commit `179df96` unless INET replies with a required API contract change.
