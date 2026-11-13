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
3. A future connection flow must use OAuth with the smallest usable scope, bind
   the resulting connection to one tenant, and write an audit record.
4. Publishing requires an explicit build artifact and idempotency key. It never
   guesses a monorepo root or publishes a running backend container.
5. New Spaces are private. Making a Space public, connecting a custom domain,
   managing DNS, or rolling back a version must each be separate user-approved
   actions.
6. Provider request IDs and stable error codes may be recorded for support; the
   bearer token and request body are never written to deployment logs.

## Intended user flow

1. A developer deploys a Go, Rust, Node, Docker, or headless WordPress origin
   to AetherHost normally.
2. They explicitly choose **Attach external frontend** and approve a scoped
   Spacefast connection.
3. CI supplies a built frontend archive, AetherHost creates or reuses a private
   Space, and the adapter publishes that artifact.
4. The console displays only verified provider state: private URL, version ID,
   operation state, and immutable URL once the operation succeeds.
5. API traffic continues to route to the AetherHost origin. Spacefast failure
   cannot alter the origin workload, its data, or its DNS.

## Status

The codebase contains a tested, disabled-by-default API adapter. It does not
yet expose a tenant UI or make live provider calls. A live integration requires
an operator-owned scoped credential or a tenant OAuth connection and an explicit
non-production publish test before it can be enabled.
