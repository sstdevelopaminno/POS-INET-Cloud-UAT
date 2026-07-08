# INET Payment Bridge

Minimal Windows Server friendly Node.js service for INET UAT QR testing.

## Endpoints

- `GET /health`
- `GET /ip`
- `GET /health/config` with `x-bridge-api-key`
- `POST /inet/create-qr`
- `POST /inet/callback`

## Local Setup

```powershell
cd apps\inet-payment-bridge
npm install
Copy-Item .env.example .env
npm run build
npm run start
```

Fill `.env` with server-only UAT values. Do not commit `.env`.

## VM Setup

On the INET VM, clone or download this repository, then run:

```powershell
cd C:\inet-cloud\POS-INET-Cloud-UAT\apps\inet-payment-bridge
npm install
Copy-Item .env.example .env
npm run build
npm run start
```

Then verify:

```powershell
curl.exe http://127.0.0.1:8787/health
curl.exe http://127.0.0.1:8787/ip
curl.exe -H "x-bridge-api-key: <bridge-api-key>" http://127.0.0.1:8787/health/config
```

For live INET UAT mode on the VM, use `NODE_ENV=production`, set
`INET_API_BASE_URL=https://new-ops-poc.inet.co.th`, and replace every
`replace-with-*` value with the real server-only secret from INET or the POS
deployment. The bridge rejects placeholder secrets before calling INET.

Create a QR smoke test:

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST `
  -Uri http://127.0.0.1:8787/inet/create-qr `
  -Headers @{"x-bridge-api-key"="<bridge-api-key>"} `
  -ContentType "application/json" `
  -Body '{"order_id":"uat-vm-test-001","amount":1,"idempotency_key":"uat-vm-test-001-key"}'
```

If QR creation fails, the JSON response includes a safe `stage` and `detail`.
For example, `{"error":"inet_bridge_config_invalid","stage":"config","detail":"INET_MERCHANT_KEY:placeholder"}`
means the VM `.env` still contains a placeholder merchant key.

## Production Notes

- Keep INET merchant keys and callback secrets server-only.
- Set `BRIDGE_API_KEY` and send it as `x-bridge-api-key` from trusted POS servers.
- Phase 1 idempotency is in-memory for a single process.
- Prefer HTTPS on `443` in front of the bridge for Vercel integration.
