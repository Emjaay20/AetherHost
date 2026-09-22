# ADR 004: Postgres & Prisma for Persistence

## Status
Accepted

## Context
We need a robust, durable source of truth for applications, entitlements, and domain events. Memory arrays are wiped on restart.

## Decision
We will use PostgreSQL as the primary data store and Prisma as our ORM. Prisma acts as an adapter. The domain models still speak in terms of `Application` and `TenantEntitlements`. 
We will wrap operations like checking quotas, incrementing usage, and recording an application creation in a single Prisma transaction so a crash cannot record an app without consuming quota.

## Consequences
- Data survives restarts.
- Application provisioning intent is robustly persisted.
- Known limitation: `can()` followed by increment inside a transaction is not fully concurrency-safe yet without explicit row locks.
