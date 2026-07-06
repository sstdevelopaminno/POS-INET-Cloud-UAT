# Questions for INET NOPS

Prepared: 2026-06-24

Send these questions with the public UAT callback URL when available.

1. Is `ref2` returned by the AccessToken API the same value as `merchant_id` sent in the Server-to-Server callback?
2. Can one Merchant Key/Merchant ID receive payments for multiple POS branches? If yes, what branch, store, sub-merchant, or terminal identifier should the POS send?
3. Can each branch settle to a different bank account under one merchant? Please provide the API field or onboarding procedure for this mapping.
4. How should the POS authenticate callbacks from INET: fixed outbound IP ranges, HMAC signature, mTLS, or a signed header? The supplied callback document does not specify one.
5. What are the UAT and production requirements for callback registration, HTTPS certificates, IP allowlists, and callback retries?

## Reply Notes

- Merchant Key received: UAT only.
- POS callback endpoint: `/api/payments/inet/callback`.
- The POS can already create dynamic, amount-bound QR codes and process `payment_status_change` callbacks.
