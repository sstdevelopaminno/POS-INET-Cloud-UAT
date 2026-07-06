# Supabase Migration Runbook

## Principles
- Create migrations locally and commit SQL files.
- Apply to staging first, then production.
- Never edit production schema manually in dashboard SQL editor.
- Backup before critical migration batches.

## Local Flow
1. Create migration file in `supabase/migrations`.
2. Run local validation and app checks.
3. Commit migration with related code changes.

## Staging Apply Flow
1. Deploy code to staging.
2. Apply pending migrations to staging Supabase project.
3. Run smoke tests:
   - auth/login flow
   - POS session + shift
   - order/payment
   - admin feature gates
4. Verify logs and RLS checklist.

## Production Apply Flow
1. Ensure staging passed and approvals completed.
2. Take backup/snapshot.
3. Apply migrations in production.
4. Deploy production app.
5. Run production smoke tests immediately.

## Rollback Notes
- Prefer forward-fix migrations instead of destructive rollback.
- If rollback is required:
  - roll back app deployment first if schema is backward-compatible
  - apply mitigation migration for schema issues
- Document any manual emergency SQL in incident notes and convert to migration file.

## RLS Verification Checklist (Required)
- Run [rls-verification-checklist.md](./rls-verification-checklist.md) after migration.
