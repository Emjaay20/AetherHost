# ADR 020: Spacefast customer-owned OAuth connection

- **Date:** 2026-11-16
- **Status:** Accepted, disabled until provider registration

## Context

AetherHost already supports private static publishing through a scoped,
operator-owned Spacefast publisher credential. That is appropriate for a
managed service, but it cannot represent a tenant's own Spacefast relationship
or team permissions.

Spacefast documents OAuth 2.0 authorization code for people and refresh-token
access with `offline_access`. A platform integration must not put provider
tokens in a browser, accept a tenant ID in the OAuth callback, or reuse an
unbound callback state.

## Decision

Add an opt-in customer-owned connection with these controls:

1. Authorization code + PKCE (`S256`) is used. The raw one-time `state` is
   returned to the browser only; AetherHost stores its SHA-256 hash and an
   encrypted verifier for ten minutes.
2. The callback is public only because possession of the one-time state binds
   it to an authenticated AetherHost tenant. The state is consumed before the
   token exchange and cannot be replayed.
3. Access and refresh tokens are encrypted by the established tenant secret
   vault. API responses and audit records include no token, client secret, or
   authorization code.
4. Tenant connections are unique per provider. A connection with one Spacefast
   team is ready immediately; multiple-team accounts must choose an accessible
   team before it can publish.
5. An expiring access token refreshes server-side with its encrypted refresh
   token. Disconnect deletes the local connection and records an audit event.
6. The operator publisher remains the fallback when no customer connection is
   active. No existing tenant workload is changed by connection failure.

## Configuration gate

The capability is unreachable until the operator configures a registered
provider client ID, client secret, exact API callback URL, and a fixed HTTPS
console success redirect. This prevents an unregistered or accidental OAuth
surface from being treated as live.

## Verification

Unit tests cover the configuration gate, PKCE state handling, encrypted token
persistence, and deterministic single-team selection. The existing external
frontend tests cover consent, artifact filtering, and retry-safe publishing.
