> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# Cloudflare Failover Runbook (Next.js SSR)

This repo has two Next.js apps configured for Cloudflare Workers via OpenNext:

- `apps/backoffice-web` -> Worker name `pos-backoffice-web`
- `apps/qr-login-web` -> Worker name `pos-qr-login-web`

## 1) One-time setup

1. Install dependencies at repo root:
   - `corepack pnpm install`
2. Authenticate Cloudflare:
   - `pnpm dlx wrangler login`

## 2) Configure secrets/env on Cloudflare

Set runtime env per app before first production deploy.

Backoffice required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POS_SESSION_HANDOFF_SECRET`
- `OPENAI_API_KEY` (if OCR/AI features enabled)

QR login required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POS_SESSION_HANDOFF_SECRET`
- `POS_QR_APPROVAL_SECRET`
- `NEXT_PUBLIC_POS_APP_URL`
- `POS_PUBLIC_RATE_LIMIT_WINDOW_SECONDS`
- `POS_QR_CREATE_RATE_LIMIT_MAX`
- `POS_STORE_RESOLVE_RATE_LIMIT_MAX`
- `POS_STORE_LOGIN_CONTEXT_RATE_LIMIT_MAX`

Example (run in each app directory):
- `pnpm wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
- `pnpm wrangler secret put POS_SESSION_HANDOFF_SECRET`

For non-secret values, use `[vars]` in `wrangler.toml` or set in Cloudflare dashboard.

## 3) Preview locally in Workers runtime

Backoffice:
- `corepack pnpm cf:preview:backoffice`

QR Login:
- `corepack pnpm cf:preview:qr`

## 4) Deploy

Backoffice:
- `corepack pnpm cf:deploy:backoffice`

QR Login:
- `corepack pnpm cf:deploy:qr`

## 5) Traffic cutover strategy

1. Keep Vercel as primary while validating Cloudflare URLs.
2. Smoke test:
   - `/preview/pos`
   - `/login/store`
3. Switch DNS (or load balancer origin) to Cloudflare.
4. Keep Vercel rollback path ready until stable.
