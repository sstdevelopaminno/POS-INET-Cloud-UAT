# INET NOPS Payment Settings Design

Date: 2026-06-24

## Evidence From INET Documents

`NEW_OPS_API_V.2.pdf` documents the QR create request as `key`, `orderId`, `orderDesc`, `amount`, `apUrl`, `regRef`, and `payType`. It does not expose an API field for a settlement bank account, account number, branch, or sub-merchant.

The callback document defines `payment_acquirer_bank` as the bank used for the payment. It is a payment result, not a merchant settlement-account setting. It also requires the merchant to provide a public callback URL to INET by email.

Therefore, the POS can automate transaction creation and payment reconciliation after INET onboarding, but it cannot provision an INET merchant, configure the merchant's settlement bank, or register a callback URL at INET through the supplied APIs.

## Product Decision

Keep the existing payment-account form for manual PromptPay/static QR. Add INET NOPS as a separate provider configuration; do not mix its fields into the bank-account form.

The sales screen remains additive:

1. Manual PromptPay/static QR remains available and uses the configured bank account.
2. When INET is enabled for the current branch, the transfer payment popup offers `Manual QR` and `INET QR`.
3. `INET QR` creates a fresh, amount-bound QR for the order. The QR is base64 returned by INET's CreatePayment API and must not be reused for another bill.
4. The UI waits for the INET server-to-server callback. On `response_code = 0`, it closes the transfer dialog, completes the order, and clears the POS without a cashier confirmation click.

## Settings UX

The payment settings landing page should have two unframed sections:

### Manual QR / PromptPay

- Existing bank name, account name, account number, PromptPay number, static image option, and active status.
- Scope: one active account for a branch, or one tenant-wide fallback account.

### INET NOPS QR

- Enable switch per branch.
- Environment segmented control: `UAT` or `Production`.
- Connection status: `not configured`, `ready`, `callback pending`, `last QR failed`, or `active`.
- Merchant ID field when INET provides one. It is optional only for the explicitly enabled UAT fallback.
- Callback URL shown read-only with a copy action. The public production/UAT URL must still be registered by INET.
- Settlement account display fields are read-only metadata supplied or confirmed by INET. They are not inputs used to provision INET.
- `Create UAT QR` test action that creates a zero-value-free test order above 0.01 THB, never a production payment.

Do not display or persist a merchant key in browser state, API response, audit metadata, or a public database table. The key is a server-side secret held in deployment secrets or a vault reference.

## Data Model

The existing `pos_payment_provider_settings` table already supports `tenant_id`, `branch_id`, provider, environment, merchant ID, and active status. Extend it only for non-secret operational metadata, for example:

- `credential_id` or server-side secret reference
- `callback_registration_status`
- `settlement_account_label`
- `last_connection_checked_at`
- `last_connection_error`

For a SaaS deployment, create a separate credential-vault abstraction rather than one process-wide environment key for every tenant:

- `payment_provider_credentials`: tenant scope, provider, environment, merchant ID, encrypted secret/vault reference, lifecycle status
- `pos_payment_provider_settings`: branch-to-credential mapping, active switch, UI status, settlement-display metadata

This allows multiple branches to share one merchant credential, or to use a separate credential per branch, without exposing the key.

## Multi-Branch Policy

The POS application can support multiple branches now: provider settings are branch-scoped, and the manual payment-account table already supports branch overrides plus a tenant-wide fallback.

The supplied INET API documents do not state whether one Merchant Key/merchant account may settle multiple branches or multiple bank accounts. Until INET confirms this, implement branch mapping in the POS but treat the settlement model as one INET merchant credential per tenant by default. A branch can be enabled only after it is mapped to a credential approved by the platform owner.

## Questions For INET

1. Is `ref2` from the access-token response the same value as callback `merchant_id`?
2. Can one Merchant Key/Merchant ID receive payments for multiple POS branches? If yes, is there a branch, store, sub-merchant, or terminal identifier to send in the API request?
3. Can each branch have a different settlement bank account under the same merchant, and what API or onboarding process configures that mapping?
4. What authenticates callbacks: fixed IP ranges, an HMAC signature, mTLS, or another header? The supplied callback document lists no signature.
5. What are the UAT and production callback registration, HTTPS certificate, and IP allowlist requirements?

## Implementation Gate

The initial INET QR settings UI, package gate, and UAT OAuth connection test are implemented. Production activation still requires a merchant ID, a registered public callback URL, and confirmed settlement scope from INET.
