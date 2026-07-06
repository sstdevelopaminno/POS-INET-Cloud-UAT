> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# Project Documentation Audit (System-wide)

Date: 2026-05-26  
Scope: documentation under `docs/` + `README.md` against current codebase routes/tests/build

## 1) Snapshot

- Markdown docs in `docs/`: `44` files
- Local markdown cross-links in `docs/*.md`: no broken links found
- Code health baseline used for this audit:
  - `npm run lint`: pass
  - `npm run typecheck`: pass
  - `npm run test`: pass
  - `npm run build`: pass (`backoffice-web` + `qr-login-web`)

## 2) Findings

### F1 (resolved): Route documentation drift

- Problem:
  - `docs/ui-route-structure.md` did not reflect current route/API surface.
- Action:
  - Updated route map from current App Router filesystem for both apps.
- Result:
  - Docs now match actual route structure and API groupings.

### F2 (resolved): Production QA checklist drift

- Problem:
  - `docs/PRODUCTION-QA-CHECKLIST.md` contained an outdated statement that audit log write path is placeholder.
- Action:
  - Updated known limitations and release criteria to reflect current implementation status.
- Result:
  - Checklist now distinguishes between "implemented" and "evidence collected".

### F3 (open): Go-live evidence still pending

- Current source docs already mark this clearly:
  - `docs/production-readiness-checklist.md`
  - `docs/definition-of-done.md`
  - `docs/go-live-evidence-checklist.md`
- Remaining blockers:
  - manual QA evidence package
  - secret rotation evidence
  - restore/rollback drill evidence
  - alert ownership and escalation evidence
  - centralized rate-limit backend rollout evidence

### F4 (open): Documentation freshness metadata inconsistent

- Many docs do not include `Last updated` or `Date`.
- Risk:
  - review teams cannot quickly assess freshness during release review.

## 3) Recommended Next Steps (for completion)

### Phase A: Release evidence closure (must do before go-live)

1. Execute `docs/manual-qa-checklist.md` and attach evidence links.
2. Complete `docs/go-live-evidence-checklist.md` with owner/date/environment.
3. Record restore + rollback drill artifacts and link from checklist docs.
4. Confirm production alert ownership and escalation paths in runbooks.
5. Validate centralized rate limiting (`RATE_LIMIT_BACKEND=upstash|redis`) with fail-closed simulation evidence.

### Phase B: Documentation governance (during development)

1. Add `Last updated: YYYY-MM-DD` to operational and architecture docs.
2. Add a short `Owner:` field for each critical runbook/checklist.
3. Update docs in same PR as feature changes affecting routes/API/security behavior.
4. Keep `docs/ui-route-structure.md` aligned with route changes each release cut.

## 4) Suggested release gate

Before tagging release:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Confirm all `Must do before go-live` items in `docs/definition-of-done.md` are evidenced.
