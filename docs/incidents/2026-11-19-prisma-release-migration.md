# 2026-11-19: Release migration and API image recovery

## Summary

The production deployment gate stopped a release before it was marked live. The
API container could not become healthy for two independent packaging and
migration reasons. The release was not recorded as live, and the API was
recovered with the intended schema change after the failure was understood.

## What happened

The `20261119110000_data_classification` Prisma migration added database
classification comments and an index. Its final statement used `CREATE INDEX
CONCURRENTLY`. Prisma runs this migration in a transaction, while PostgreSQL
does not allow concurrent index creation in a transaction. PostgreSQL rejected
the migration and Prisma correctly stopped subsequent startup attempts.

After the database change was recovered, the new image advanced to application
startup and exposed a second fault: the production-only package contained the
Prisma library but not its generated client. The image exited rather than
serving a partially initialized API.

## Recovery

1. Confirmed that the failed migration had applied no transactional changes and
   that the target index did not exist.
2. Applied the intended comments and regular idempotent index with PostgreSQL
   validation enabled.
3. Marked the existing Prisma migration record complete only after that SQL
   succeeded, preserving the database migration history.
4. Corrected the migration source to use transaction-safe `CREATE INDEX IF NOT
   EXISTS` for new environments.
5. Updated the API image to generate Prisma's client inside its standalone
   production dependency tree.

## Prevention

- Production deployments remain gated on API health; a release is not recorded
  as live until the replacement services are healthy.
- The release workflow now runs the API migration command and loads Prisma's
  generated client before replacing the running API. Immutable image references
  are persisted only after readiness succeeds.
- The API image is self-contained: production dependencies and the generated
  Prisma client are produced together instead of relying on pnpm workspace
  symlinks or build-stage artifacts.
- Prisma migrations must not use PostgreSQL statements that are prohibited in
  transactional migration blocks. Review deployment-impacting SQL before a
  release.

## Impact

No release was promoted while the API was unhealthy. The recovery altered only
the intended schema metadata and index; no tenant data was modified.
