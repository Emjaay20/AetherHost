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
   not receive, store, or see a Spacefast credential. When the operator
   configures a registered Spacefast OAuth client, a tenant can instead connect
   its own account. The OAuth flow uses authorization code + PKCE, a one-time
   hashed state, encrypted token storage, refresh-token rotation, scoped team
   selection, disconnect, and audit records.
4. Publishing requires an explicit static export and idempotency key. The
   adapter accepts only an `index.html` in `public/` or `dist/` and includes
   only safe browser assets below that one selected directory. It strips the
   selected directory prefix so `index.html` is at the ZIP root. It excludes
   source maps, `.env*`, `*.config.*`, package manifests, and lockfiles even
   when their extensions would otherwise be allowed. It packages at most 200
   files / 10 MiB. A root-level `index.html` is deliberately rejected: that
   layout commonly mixes a backend entry point and package metadata with the
   frontend. The adapter never guesses a monorepo root, reads the tenant
   filesystem, or publishes a running backend container.
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
   retry instead of creating an orphaned Space. AetherHost also reconciles
   pending provider operations once per minute, so final status does not depend
   on a tenant leaving the console open.
5. API traffic continues to route to the AetherHost origin. Spacefast failure
   cannot alter the origin workload, its data, or its DNS.

## Publish states and recovery

Each application has one publish record per provider. Its `status` moves
through these states:

| State | Meaning | Leaves the state when |
|---|---|---|
| `publishing`, with an operation | Spacefast accepted the upload and is finalizing it | The reconciler sees `succeeded` (→ `published`), `failed` or `canceled` (→ `failed`), or a 404 for the operation (→ `failed`, `operation_not_found`) |
| `publishing`, no operation | AetherHost holds the publish slot and is talking to Spacefast | The request finishes, or the 10-minute lease expires (→ `failed`, `interrupted`) |
| `published` | The version is finalized | A new publish is requested |
| `failed` | `lastErrorCode` says why | A new publish is requested |

Recovery rules:

- **One publisher at a time.** A publish claims the record with a conditional
  write (create, or update only if the row is unchanged since it was read). A
  concurrent request that loses the claim gets the current record back and
  sends nothing to Spacefast.
- **Interrupted attempts are retryable.** An API restart mid-publish leaves
  `publishing` with no operation. After the lease, the reconciler marks it
  `failed` (`interrupted`) and audits it; a tenant can also publish again
  straight away once the lease has expired.
- **Resuming does not duplicate work.** A resumed attempt reuses its original
  idempotency key. Spacefast replays stored results for 24 hours, so a Space or
  upload that succeeded before the interruption is returned rather than created
  again. The upload key includes a digest of the exported files, because
  Spacefast rejects a reused key with a different body
  (`idempotency_key_reused`); changed files are therefore a new request.
- **No silent waiting.** A receipt that is neither finished nor pollable is
  recorded as `failed` (`operation_missing`); AetherHost does not drive the
  multi-step upload/finalize flow.
- **Fair polling.** Each non-final poll touches the record, so the oldest-first
  reconciler batch of 100 rotates through every pending publish.

Not covered yet: removing a Space when its application is deleted, and
checking an operation with the credential that started it after a tenant
connects or disconnects their own Spacefast account.

## Practical WordPress workflow

This is a hybrid pattern, not a migration of WordPress to a static host.
AetherHost continues to run a WordPress application's nginx, PHP-FPM, MariaDB,
Redis, uploads, admin interface, and any dynamic plugins. Those are not sent to
Spacefast.

Use the external frontend option when a project also has an intentionally static
artifact, for example a campaign landing page, documentation site, design
preview, or a headless WordPress frontend that has been exported to static HTML
and browser assets. Save that export with the AetherHost application, then:

1. Open **External frontend → Spacefast publishing** in the AetherHost console.
2. Expand only the application you want to publish. The compact list shows
   whether it is unpublished, publishing, published privately, or needs
   attention.
3. Confirm the explicit per-version consent checkbox and select **Publish
   privately**. AetherHost sends only the bounded static export, never the
   WordPress runtime, database, uploads, repository, or `.env` file.
4. Continue using WordPress normally in AetherHost. Once the provider operation
   finishes, the server-side reconciler records the verified private version.
   Republishing a changed static export creates a new version in the same saved
   Space rather than silently changing the origin deployment.

For a senior-engineering demonstration, show both sides: the WordPress workload
profile and its health in AetherHost, then the explicit, private publication of
a separate static presentation artifact. This demonstrates a clear ownership
boundary and a reversible integration; it does not claim that a static artifact
can substitute for WordPress's dynamic runtime.

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

## Archive layout and legacy applications

Spacefast preserves archive paths and serves `index.html` at the website root
when that file is at the archive root. AetherHost therefore re-roots a chosen
`public/` or `dist/` directory before it uploads the archive. This prevents a
`dist/index.html` archive from being served only at `/dist/index.html` and keeps
the archive from looking like source that Spacefast should build. See
[Spacefast's publishing guide](https://developers.spacefast.com/docs/publish/)
and its [plain HTML recipe](https://spacefast.com/docs/recipes/html/).

Apps created by the original AetherPress Launchpad template stored browser files
at the repository root. They are intentionally not migrated automatically:
moving stored files could alter an application outside an explicit deployment.
Recreate the demo with the current template, or create a new application whose
finished frontend files live in `public/` or `dist/`, then publish that export.

## Customer-owned OAuth setup

Customer-owned connections are disabled until all of the following root-owned
environment values are configured:

- `SPACEFAST_OAUTH_CLIENT_ID`
- `SPACEFAST_OAUTH_CLIENT_SECRET`
- `SPACEFAST_OAUTH_REDIRECT_URI` — register this exact HTTPS callback at
  Spacefast: `/v1/integrations/spacefast/oauth/callback` on the API origin.
- `SPACEFAST_OAUTH_SUCCESS_REDIRECT` — the HTTPS AetherHost console URL to
  return to after a successful callback.

The requested scopes are `teams:read`, `spaces:read`, `spaces:write`,
`publish:write`, and `offline_access`. The browser receives only the
authorization redirect; access and refresh tokens are AES-256-GCM encrypted
using AetherHost's tenant-secret vault and are never returned by any API route.
If a user belongs to more than one Spacefast team, they must choose a team after
connecting. A selected customer connection is used for that tenant's future
publishes; otherwise the existing operator-managed publisher is used.

## Status and boundary

The codebase now has a tested, disabled-by-default, tenant-facing **private
static publishing** flow backed by one operator-managed Spacefast publisher
credential. It is useful for an AetherHost-hosted API plus a separately
published static UI, while retaining the original workload, database, secrets,
and domain in AetherHost.

The customer-owned OAuth implementation is present but intentionally dormant
without provider-side client registration and the four environment values above.
Creating those provider credentials is an external authorization action and is
not implied by deploying this code. Domain changes, public Spaces, and version
rollbacks remain separate user-approved actions.
