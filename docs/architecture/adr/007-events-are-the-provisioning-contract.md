# 007 - Events are the Provisioning Contract

## Context
When a tenant creates a new application, the control plane needs to instruct downstream worker agents (e.g. Go-based provisioners) to allocate the physical resources (Docker containers, DNS records). If the control plane calls the provisioner directly (RPC/HTTP), a network failure leaves the database and infrastructure out of sync.

## Decision
We use **Domain Events** as the strict contract for provisioning.
When an application is created, the control plane writes an `ApplicationProvisioningRequested` event to the `DomainEventRecord` table inside the *exact same Postgres transaction* that increments the tenant's quota usage. 

The dashboard displays this event log to the user, proving that intent was recorded. Future provisioning agents will trail this event table (or a derived stream) to act on resources.

## Consequences
**Positive:**
- **Transactional Outbox:** Quota consumption and provisioning intent are strictly bound. You cannot consume quota without emitting the event, and you cannot emit the event if quota is rejected (403).
- **Asynchronous Decoupling:** The Node.js API does not wait for infrastructure to spin up. It responds in milliseconds.
- **Traceability:** The dashboard natively serves as an audit log of provisioning. 

**Negative:**
- We must build or adopt a worker component (e.g., Go agent) to tail these events and perform the actual provisioning.
- UI state reflects "Intent" (`pending`) rather than "Ready" until the worker reports back.

## Notes
A rejected resource creation (403) will deliberately *never* insert an event. This ensures downstream provisioners only ever process commercially approved workloads, significantly simplifying worker logic.
