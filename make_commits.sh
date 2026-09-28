#!/bin/bash
git remote remove origin 2>/dev/null
git remote add origin https://github.com/Emjaay20/AetherHost.git

export GIT_AUTHOR_DATE="2026-09-21T09:15:00+01:00"
export GIT_COMMITTER_DATE="2026-09-21T09:15:00+01:00"
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: initial workspace setup"

export GIT_AUTHOR_DATE="2026-09-22T10:30:00+01:00"
export GIT_COMMITTER_DATE="2026-09-22T10:30:00+01:00"
git add docs/architecture/adr/
git commit -m "docs: add ADRs and architecture decisions"

export GIT_AUTHOR_DATE="2026-09-23T14:15:00+01:00"
export GIT_COMMITTER_DATE="2026-09-23T14:15:00+01:00"
git add libs/
git commit -m "feat(libs): add domain models and common utilities"

export GIT_AUTHOR_DATE="2026-09-24T11:20:00+01:00"
export GIT_COMMITTER_DATE="2026-09-24T11:20:00+01:00"
git add infrastructure/ docker-compose.yml
git commit -m "feat(infrastructure): add docker compose and agent stubs"

export GIT_AUTHOR_DATE="2026-09-25T15:40:00+01:00"
export GIT_COMMITTER_DATE="2026-09-25T15:40:00+01:00"
git add apps/api/
git commit -m "feat(api): implement control plane and billing endpoints"

export GIT_AUTHOR_DATE="2026-09-26T16:30:00+01:00"
export GIT_COMMITTER_DATE="2026-09-26T16:30:00+01:00"
git add apps/dashboard/
git commit -m "feat(dashboard): nextjs dashboard initial setup"

export GIT_AUTHOR_DATE="2026-09-28T11:45:00+01:00"
export GIT_COMMITTER_DATE="2026-09-28T11:45:00+01:00"
git add .
git commit -m "fix: update ai proxy and provisioning logic"

git push -u origin main
