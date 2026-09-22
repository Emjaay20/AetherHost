# 008 - Provisioner Stub Before Agents

## Context
We need a mechanism to take `PENDING` applications and physically allocate resources for them, moving their status to `RUNNING`. Real deployment agents (e.g. Go agents) introduce network, queueing, and operational complexity that would slow down the development of the core platform control plane logic.

## Decision
We implemented a **Provisioner Stub** directly within the NestJS control plane.
- The `POST /v1/applications` endpoint remains strictly commercial: it checks quotas, writes intent, and completes instantly.
- A separate `ProvisioningService` implements a `RuntimeProvisioner` Strategy interface.
- We trigger `POST /v1/provisioning/tick` manually (or via cron) to load pending apps, simulate a 150ms delay, and emit an `ApplicationStatusChanged` event.

## Consequences
**Positive:**
- Immediately validates the event-driven decoupling between "intent" and "actuation".
- We establish the data contracts and interfaces for future runtimes (`nodejs`, `wordpress`) without building actual infrastructure.
- The dashboard is immediately unblocked to visualize real status progression and event streaming.

**Negative:**
- The stub runs in-process. It does not test real distributed system failure modes (e.g. partition tolerance between API and worker).

## Notes
Building stubs before distributed agents is a hallmark of strong platform engineering. It allows the core control plane to mature while isolating the complexity of real infrastructure orchestration until strictly necessary.
