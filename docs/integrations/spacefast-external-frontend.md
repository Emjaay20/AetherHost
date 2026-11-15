# Spacefast External Frontend Adapter

## Purpose

This adapter demonstrates an intentionally narrow integration between
AetherHost and Spacefast. AetherHost remains responsible for tenant backend
workloads, databases, persistent volumes, domains it manages, and deployment
health. Spacefast is an optional external target for an explicit static or
frontend build artifact.

It is not enabled by default, does not run a CLI on the VPS, and does not copy
or replace a tenant's deployment directory.

## Verified provider contract

The adapter uses the documented HTTPS API at `https://api.spacefast.com/v1`:

- `POST /v1/spaces` creates a private Space.
- `POST /v1/publish?async=1` accepts an explicit project archive and returns a
  version plus an operation that can be polled.
- `GET /v1/operations/{id}` reports asynchronous completion.
- mutating requests include an idempotency key.

These calls are based on Spacefast's published API overview, not inferred CLI
syntax. See <https://spacefast.com/docs/api/>.

## Safety model

1. The adapter is disabled until `SPACEFAST_ENABLED=true` and a server-side,
   scoped `SPACEFAST_API_KEY` are supplied.
2. No tenant API key is stored in AetherHost's database or returned to a browser.
3. The initial tenant flow uses a single operator-owned, expiring publisher
   credential. It is deliberately marked as **operator-managed**: tenants do
   not receive, store, or see a Spacefast credential. A future customer-owned
   connection must use OAuth with the smallest usable scope, bind the resulting
   connection to one tenant, and write an audit record.
4. Publishing requires an explicit static export and idempotency key. The
   adapter accepts only a stored `index.html` at the project root, `public/`, or
   `dist/`, plus safe static assets (HTML, CSS, browser JavaScript, images,
   fonts, and JSON). It packages at most 200 files / 10 MiB as a ZIP. It never
   guesses a monorepo root, reads the tenant filesystem, publishes `.env`, or
   publishes a running backend container.
5. New Spaces are private. Making a Space public, connecting a custom domain,
   managing DNS, or rolling back a version must each be separate user-approved
   actions.
6. Provider request IDs and stable error codes may be recorded for support; the
   bearer token and request body are never written to deployment logs.

## Intended user flow

1. A developer deploys a Go, Rust, Node, Docker, or headless WordPress origin
   to AetherHost normally.
2. They choose **Publish a static artifact to Spacefast** in the AetherHost
   console and explicitly consent to that specific transfer (including a new
   version).
3. AetherHost selects only the saved static export, creates or reuses one
   private Space, and publishes a ZIP. It writes a consent audit record before
   the provider call and a request/failure/result record afterwards.
4. The console displays only verified provider state: private URL, version ID,
   operation state, and immutable URL once the operation succeeds. If the
   provider call fails after Space creation, the saved Space ID is reused on a
   retry instead of creating an orphaned Space.
5. API traffic continues to route to the AetherHost origin. Spacefast failure
   cannot alter the origin workload, its data, or its DNS.

## Operator verification

The control plane exposes two operator-only endpoints:

- `GET /v1/admin/integrations/spacefast` reports whether the feature and
  server-side credential are configured (never the credential itself).
- `POST /v1/admin/integrations/spacefast/verify` calls `GET /v1/me` and checks
  that the configured team is visible to the credential. It returns only a
  boolean, a provider request ID where available, and a stable provider error
  code.

Set `SPACEFAST_ENABLED=true`, `SPACEFAST_API_KEY`, and
`SPACEFAST_TEAM_ID` only in the root-owned production environment file. The
recommended key is the **Space publisher** preset with an explicit expiry.

## Tenant-facing API

Authenticated tenant requests are scoped through the normal AetherHost tenant
identity. The API never accepts a tenant ID from the browser.

- `GET /v1/external-frontends` lists the caller's external frontend records.
- `POST /v1/external-frontends/{applicationId}/spacefast/publish` requires
  `{ "consent": true }`, verifies application ownership, and publishes only an
  eligible static export.
- `POST /v1/external-frontends/{applicationId}/spacefast/refresh` polls a
  pending provider operation.

The `ExternalFrontendDeployment` record is unique per application and provider.
It stores provider identifiers and safe status/error codes, not a bearer token
or artifact content. Consent and publish lifecycle events are written to the
existing audit log.

## Status and next boundary

The codebase now has a tested, disabled-by-default, tenant-facing **private
static publishing** flow backed by one operator-managed Spacefast publisher
credential. It is useful for an AetherHost-hosted API plus a separately
published static UI, while retaining the original workload, database, secrets,
and domain in AetherHost.

It is not customer-owned OAuth. Enabling that next step needs an OAuth client
registered with Spacefast, a callback URL, encrypted refresh-token storage,
token revocation, and a connection-management UI. It should not be represented
as implemented until those provider-side credentials and safeguards exist.
