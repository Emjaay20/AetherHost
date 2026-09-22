# 010 - Go Agent Polls Control Plane

## Context
While our `ProvisioningService` and `ProvisionerFactory` successfully handle strategy-based provisioning, triggering this process manually via the dashboard or a cron job is insufficient for a real-time, event-driven platform. We need workers to pick up tasks automatically. 

## Decision
We introduced a separate **Go Agent** (`apps/agent-go`) that runs entirely out-of-process from the NestJS control plane.
- The agent polls `GET /v1/applications?status=pending&runtime=nodejs` on a 5-second interval.
- When it finds pending applications, it triggers `POST /v1/provisioning/:id` back on the control plane.
- The control plane's factory handles the actual logic and emits the `ApplicationStatusChanged` event.

## Consequences
**Positive:**
- **Strict Separation of Concerns:** The agent knows nothing about quotas, billing, Prisma, or Postgres. It is a dumb worker that only knows its assigned runtime and the API URL.
- **Resilience:** If the Go agent crashes or is stopped, the control plane is unaffected. The queue (in this case, Postgres rows) remains safe and `pending`. No quota is oversold.
- **Polyglot Foundation:** We now have a second language (Go) interacting safely with the domain model, proving our decoupled architecture.

**Negative:**
- We introduced polling (`GET` every 5 seconds) which doesn't scale perfectly for thousands of apps. In the future, this HTTP polling can easily be swapped for a Kafka or RabbitMQ queue without fundamentally changing the worker's logic.

## Notes
The fact that this agent can be scaled out per-runtime (one for Node.js, one for WordPress) solidifies the multi-runtime application model outlined in ADR 002.
