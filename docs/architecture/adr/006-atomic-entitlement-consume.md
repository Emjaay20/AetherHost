# 006 - Atomic Entitlement Consumption

## Context
Our initial entitlements gatekeeper implementation used a check-then-act approach in Node.js (read quota -> if enough -> increment). Under high concurrency (e.g. parallel API requests), two requests could both read the current quota before either increments it, allowing a tenant to provision resources beyond their paid plan limits.

## Decision
We enforce quota limits atomically using a single conditional SQL `UPDATE`:
```sql
UPDATE "TenantEntitlement"
SET "usageApplications" = "usageApplications" + 1
WHERE "tenantId" = $1
  AND "usageApplications" < "limitApplications"
```
This is executed via Prisma's `$executeRaw`. 

If zero rows are updated, it means the limit was reached (or the tenant doesn't exist). This triggers a `403 Forbidden` response and cleanly aborts the surrounding Postgres transaction, rolling back any pending application inserts.

## Consequences
**Positive:**
- Complete safety against race conditions and quota overselling.
- The control plane's domain logic (Node.js) defers the final constraint check to the persistence layer (Postgres) where row-level locking natively handles concurrency.
- Dashboards are strictly cosmetic and eventual; the database acts as the strict enforcer.

**Negative:**
- We rely on raw SQL strings because Prisma's `update` doesn't support complex condition comparisons between two columns (`usageApplications < limitApplications`) in a single fluid call without an explicit `where` that allows raw logic or `check` constraints.

## Notes
A Revenue/SRE perspective demands that quota over-provisioning is impossible at the lowest possible layer. This conditional update guarantees atomic provisioning guarantees without adding heavy distributed locks (e.g., Redis).
