# ADR 019: Operator-managed external frontend publishing

- **Date:** 2026-11-15
- **Status:** Accepted

## Context

AetherHost tenants can host a backend workload, data services, secrets, and
domains on the platform, but may want to publish a separate static frontend to
Spacefast. A previous deployment incident showed why a hosting agent must not
infer a repository root, replace a deployment directory, or treat a container
that returns one HTML page as proof that a real application has deployed.

Spacefast exposes an HTTPS API for private Space creation, static file/archive
publishing, and asynchronous operation polling. AetherHost has a scoped,
expiring publisher credential held only in the root-owned production
environment. It does not yet have a registered OAuth application or tenant
token lifecycle.

## Decision

Offer private static publishing as an **operator-managed** external frontend
target with these boundaries:

1. The tenant must explicitly consent per publish request. The server verifies
   the tenant owns the application; it never trusts a tenant ID supplied by a
   browser.
2. The server reads only the tenant's saved application manifest, never an
   arbitrary source repository or deployment directory. When an initial
   generated deployment finishes, AetherHost clears its one-time write marker
   but retains that manifest so an eligible static export remains publishable;
   the agent will not reapply it after the marker is cleared. A valid export needs `index.html` in an explicit
   `public/` or `dist/` directory. It includes only safe static asset extensions
   below that one directory, strips the directory prefix in the archive, and
   excludes source maps, `.env*`, `*.config.*`, package manifests, and lockfiles.
   Root-level `index.html` is rejected because it may share a directory with a
   backend entry point or runtime configuration. The export remains bounded to
   200 files / 10 MiB.
3. The selected files are packaged as a ZIP and uploaded to a private Space.
   No `.env`, token, database, Docker configuration, backend process, or
   custom-domain change is eligible for transfer.
4. A durable `ExternalFrontendDeployment` record holds safe provider IDs,
   status, idempotency key, and error code. It is unique by application and
   provider. The created Space ID is persisted before upload so retries do not
   create a fresh private Space after an interrupted upload.
5. Consent, publish request, provider failure, and terminal operation results
   are recorded in AetherHost's audit log. Provider credentials and raw upload
   contents are never logged.

## Consequences

This supports a credible hybrid use case: a static UI can be published to
Spacefast while its API, managed data, secrets, domain controls, and deployment
health remain under AetherHost. An external-provider outage cannot terminate,
rewrite, or reconfigure the AetherHost workload.

The current publisher key represents a shared operator relationship with
Spacefast; it is not a customer-owned connection. Customer-managed OAuth is a
future bounded project requiring provider registration, PKCE callback handling,
encrypted refresh-token storage, revocation, expiry handling, connection
auditing, and a tenant connection-management UI.

## Verification

- Unit tests prove consent is required, static selection excludes unsafe paths,
  maps, configuration-like files, and `.env`, and roots the generated archive
  at the selected frontend directory.
- A prior controlled private-space publish verified the provider contract and
  asynchronous operation completion. See
  `docs/validation/2026-11-15-spacefast-private-publish.md`.
- Production rollout includes the Prisma migration and a post-deployment
  readiness check. A real tenant publish will be recorded separately after a
  tenant chooses an eligible static application.
