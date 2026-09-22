# 005 - Prisma Version Pinning (v5.21)

## Context
During the initialization of our PostgreSQL persistence layer for the control plane, using the newest version of the `@prisma/client` and `prisma` CLI (v8.0.0-rc+) introduced breaking changes to the local workflow. The new CLI versions expect interaction with the Prisma Cloud Platform (via `@prisma/composer`), which breaks standard offline `generate` and `migrate dev` workflows out-of-the-box in our local Docker setup.

## Decision
We pinned the Prisma dependencies (`prisma` and `@prisma/client`) strictly to version **5.21.0**.

## Consequences
**Positive:**
- Immediately unblocks local development and database provisioning.
- Allows us to use standard, well-documented `npx prisma migrate dev` workflows without unexpected Cloud proxy dependencies.
- Ensures stability and predictability in our CI/CD pipelines since the CLI behavior is well-understood.

**Negative:**
- We miss out on any features or performance improvements introduced in Prisma v6+.
- Future upgrades will require deliberate effort to assess the impact of Prisma's new CLI tools.

## Notes
Version pinning is a deliberate engineering decision to prioritize stability and developer velocity over adopting the bleeding edge. In a platform engineering context, predictable persistence tools are far more valuable than the latest features.
