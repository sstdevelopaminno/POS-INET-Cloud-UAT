# INET Payment Bridge

Minimal Windows Server friendly Node.js service for INET UAT QR testing.

## Endpoints

- `GET /health`
- `GET /ip`
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
```

## Production Notes

- Keep INET merchant keys and callback secrets server-only.
- Set `BRIDGE_API_KEY` and send it as `x-bridge-api-key` from trusted POS servers.
- Phase 1 idempotency is in-memory for a single process.
- Prefer HTTPS on `443` in front of the bridge for Vercel integration.
