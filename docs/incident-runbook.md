# Incident Runbook

## 1) Detect Issue
- Confirm symptom from monitoring/alerts/logs.
- Classify severity (P1/P2/P3).
- Start incident channel and assign incident commander.

## 2) Identify Scope and Impact
- Identify affected tenants/branches.
- Identify impacted surface (`id`, `pos`, `admin`, `www`).
- Capture failing endpoints and error codes.

## 3) Immediate Containment
- Disable affected feature flag/override when possible.
- Block compromised device(s) if security risk is suspected.
- Revoke active sessions if token/session abuse suspected.

## 4) Rollback / Mitigation
- Roll back Vercel deployment to last known good build when app regression is confirmed.
- If migration-related:
  - apply mitigation SQL migration (forward-fix preferred)
  - avoid manual drift not captured in migration files.

## 5) Communications
- Internal update every 15-30 minutes for active P1/P2.
- External communication template:
  - What happened
  - Who is affected
  - Current mitigation
  - Next update ETA

## 6) Recovery Validation
- Re-run smoke tests:
  - secure login handoff
  - session + shift gate
  - order create + pay
  - admin critical actions
- Confirm error rates return to baseline.

## 7) Postmortem Template
- Incident ID:
- Start/End time:
- Detection source:
- Root cause:
- Blast radius (tenants/branches/users):
- Timeline:
- Mitigation steps:
- What worked / what failed:
- Corrective actions (owner + due date):

## 8) Vercel Security Bulletin Response (April 2026 Playbook)
- Trigger condition:
  - External advisory indicates possible compromise of Vercel internal systems or non-sensitive environment variables.
- Triage (first 15 minutes):
  - Confirm platform health at `https://vercel.statuspage.io/`.
  - Read latest official bulletin at `https://vercel.com/kb/bulletin/vercel-april-2026-security-incident`.
  - Declare security incident bridge and assign owner for: identity, secrets, deployments, and communications.
- Containment (first 60 minutes):
  - Revoke suspicious Google OAuth grants in Google Workspace, especially IOC app:
    - `110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com`
  - Enforce MFA/passkeys for Vercel team members.
  - Set Deployment Protection to at least `Standard`.
  - Rotate Deployment Protection tokens (if used).
- Secret rotation (priority order):
  - Rotate all Vercel env vars that were not marked as sensitive:
    - database credentials, API keys, webhook secrets, signing keys, service tokens.
  - Prioritize high-impact keys used in this repo:
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `OPENAI_API_KEY`
    - `POS_SESSION_HANDOFF_SECRET`
    - `MOBILE_ENROLLMENT_SECRET`
  - Re-deploy after rotation so runtime instances use new values.
- Verification:
  - Review Vercel activity logs for unexpected env reads, deployment actions, and token creation.
  - Review recent deployments and remove suspicious ones.
  - Re-run smoke tests for:
    - `http://localhost:3001/login/store`
    - `http://localhost:3000/preview/pos`
    - login handoff, session gate, order create/pay flow.
- Evidence to capture:
  - Timestamped screenshots of status page + bulletin version/date.
  - List of rotated secret names (never include raw values).
  - Incident timeline and owner acknowledgements.
