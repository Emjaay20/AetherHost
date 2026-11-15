# Spacefast private publish validation — 15 November 2026

## Goal

Verify AetherHost can use the documented Spacefast API as a narrowly scoped
external frontend target without giving that provider access to an AetherHost
workload, database, deployment directory, tenant secret, or DNS control.

## Setup

- Provider credential: team-scoped **Space publisher** credential held only in
  the root-owned production environment. Its value is not stored in Git,
  AetherHost's database, application logs, or this report.
- AetherHost release: `6743e4e`, which exposes operator-only configuration and
  credential-verification endpoints.
- Target: a newly created private Space named `aetherhost-integration-proof-20261115`.
- Artifact: a single harmless `index.html` file stating that it is an external
  frontend integration verification. It contains no customer data or
  credentials.

## Result

1. The running AetherHost API authenticated to `GET /v1/me` with HTTP `200`.
2. `POST /v1/spaces` created a private Space with HTTP `201`.
3. `POST /v1/publish?async=1` accepted the artifact and returned a
   `version_finalize` operation.
4. Polling `GET /v1/operations/{id}` reached `succeeded`.
5. Both the live URL and immutable version URL returned HTTP `403` without a
   Spacefast session, as expected for a private Space. This is a privacy
   assertion, not a failed availability test.

## Guardrails verified

- The bearer credential was sent only from the VPS and never to a browser or
  tenant container.
- Spacefast received only a static HTML artifact; it did not receive source
  checkout paths, the AetherHost Docker socket, database credentials, tenant
  environment variables, or domain-management authority.
- The normal AetherHost API, dashboard, and agent health checks passed after
  deployment.

## Release correction

The first release of the operator verification module exposed a NestJS runtime
dependency-injection fault caused by using a type-only configuration import.
The image built and the focused client test passed, but the API restart made the
fault visible during real startup. The repair in `6743e4e` imports
`ConfigModule` into the adapter module and injects the runtime `ConfigService`.
After the repair release, API, dashboard, and agent all reported healthy and
the provider authentication check returned HTTP `200`.

This is retained as evidence that build tests are useful but not sufficient:
production-like startup and provider verification are separate release gates.

## Deliberate next boundary

This validates the provider adapter, not a tenant self-service publishing
feature. Before adding a tenant publish button, AetherHost needs an explicit
frontend build-artifact contract, tenant consent, encrypted connection records,
and audit events. That prevents a deployment assistant from guessing a
monorepo root or replacing a backend deployment with a placeholder frontend.
