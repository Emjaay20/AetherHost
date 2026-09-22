# ADR 001: Start with a Modular Monolith

## Status
Accepted

## Context
We need to build a multi-runtime managed hosting platform with billing, entitlements, AI capabilities, and strong reliability practices. Moving to microservices too early would slow us down significantly and increase operational complexity.

## Decision
We will start with a **modular monolith** using NestJS.  
Each major business capability (Tenancy, Applications, Entitlements, Billing, AI, etc.) will live in its own NestJS module with clear boundaries.  

We will extract services into separate deployable units only when there is a clear scaling, team, or reliability reason to do so.

## Consequences
Positive:
- Much faster development speed
- Easier refactoring of boundaries
- Simple local development and testing
- Clear path to extract modules later

Negative:
- We must be disciplined about module boundaries
- Some performance isolation is deferred

## Notes
This decision supports the Principal/Staff level expectation of making deliberate trade-offs between speed and complexity.
