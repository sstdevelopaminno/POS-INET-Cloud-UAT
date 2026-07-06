# Go-live Evidence Checklist

This document captures operational evidence required before production go-live.

## A) Manual QA Signoff

Reference checklist: `docs/manual-qa-checklist.md`

Required evidence:
- Tester name:
- Date:
- Environment (`staging`/`production-preview`):
- Tenant/branch tested:
- Overall result (`pass`/`fail`):
- Evidence link (ticket/video/log/screenshot):
- Failed cases:
- Resolution summary:
- Retest result:

## B) Secret Rotation Evidence

Required evidence:
- Supabase anon key reviewed:
- Supabase service role rotated (if exposed during development):
- `SESSION_SECRET` rotated:
- `INTERNAL_API_SECRET` rotated (if used):
- Vercel env vars updated:
- Old secrets revoked:
- Secret scan confirms no real secrets committed:
- Evidence link:

## C) Restore/Rollback Drill Evidence

Required evidence:
- Supabase backup snapshot ID/time:
- Restore drill date:
- Restore drill result:
- Vercel rollback tested date:
- Migration rollback/mitigation test result:
- Incident runbook walkthrough completed:
- Evidence link:

## D) Alert and On-call Ownership

Required evidence:
- Alert destinations (PagerDuty/Slack/email):
- Primary owner:
- Secondary owner:
- Escalation path:
- Login failure spike alert configured:
- Order failure alert configured:
- Database error alert configured:
- Rate limit spike/backend failure alert configured:
- 5xx spike alert configured:
- Evidence link:
