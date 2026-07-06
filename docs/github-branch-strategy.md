# GitHub Branch Strategy and Protection

## Branch Model
- `main`: production branch.
- `develop`: staging/integration branch.
- `feature/*`: feature implementation branches.
- `hotfix/*`: emergency production fixes.

## Pull Request Flow
1. Start work from `develop` using `feature/*`.
2. Open PR into `develop` for integration and QA.
3. Promote stable commits from `develop` to `main` via PR.
4. For incident fixes, branch from `main` using `hotfix/*`, open PR to `main`, then back-merge to `develop`.

## Required Branch Protection (GitHub Settings)
Apply to both `main` and `develop`:
- No direct push.
- PR required before merge.
- CI status check required (`CI / verify`).
- At least 1 reviewer required.
- Dismiss stale approvals on new commits.
- Block force-push.
- Block branch deletion.

## Release Rules
- `main` deploys to production.
- `develop` deploys to staging/preview environment.
- Every deployment commit must be traceable to a reviewed PR.

## Notes
- Repository-level branch protection is configured in GitHub settings (not in code).
- Keep `hotfix/*` scope minimal and incident-linked.
