# ADR 003: Entitlements as Gatekeeper

## Status
Accepted

## Context
Applications must not know about plans or prices. They only ask: "Can this tenant create another application on this runtime?"

## Decision
We will use an entitlements module as the gatekeeper. The `ApplicationsModule` never reads plan objects. It asks `can()` and then records usage.

## Consequences
- Keeps pricing changes out of the hosting path.
- Emits events after successful operations so infrastructure can subscribe later.
