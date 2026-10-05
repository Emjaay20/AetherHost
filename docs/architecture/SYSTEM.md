# System Map

This document outlines the four critical request flows within the AetherHost control plane. These represent the core transactions that govern resources, manage workloads, run AI features, and handle revenue.

## 1. Create App + Atomic Quota

**Trigger:** `POST /v1/applications` (User clicks "Deploy" on dashboard)

1. `ApplicationsController` receives the request.
2. `ApplicationsService` opens a Prisma transaction.
3. `EntitlementsService.consumeApplicationSlot` executes an atomic SQL query:
   - `UPDATE "TenantEntitlement" SET usage = usage + 1 WHERE usage < limit`
4. If the update affects 0 rows, it throws a `403 Forbidden` (Quota Exhausted).
5. If successful, the `Application` record is inserted with status `PENDING`.
6. A `ApplicationProvisioningRequested` domain event is emitted.
7. Transaction commits.

*Key takeaway:* Commercial gating is synchronous, atomic, and inescapable.

## 2. Tick / Go Agent → Strategy Provisioner

**Trigger:** Go worker polls `GET /v1/applications?status=pending` (or manual tick)

1. The Go agent identifies a `PENDING` app and calls `POST /v1/provisioning/:id`.
2. `ProvisioningService` intercepts the command and uses `ProvisionerFactory` to locate the correct `RuntimeProvisioner` strategy (e.g., WordPress, Node.js, Python).
3. The selected provisioner strategy runs its logic (currently stubbed).
4. `ProvisioningService` updates the app status from `PENDING` to `RUNNING`.
5. An `ApplicationStatusChanged` domain event is emitted to the log.

*Key takeaway:* The control plane delegates the "how" of provisioning to out-of-process workers and strategy adapters, keeping the core domain clean.

## 3. Ops Insight → Proxy → Adapter

**Trigger:** `POST /v1/ai/insights/ops` (User clicks "Generate Insight" on dashboard)

1. `OpsInsightService` reads up to 20 apps and 30 events from Prisma for the tenant.
2. It shapes this data into a prompt and calls `AiProxyService.complete()`.
3. **Authorize**: `AiProxyService` asks `EntitlementsService.canAiRequest()` to verify quota exists (read-only).
4. **Call**: `ModelFactory` selects the correct `ModelAdapter` (Stub or OpenAI) and fires the request.
5. **Meter**: If the LLM successfully returns, a Prisma transaction opens:
   - `EntitlementsService.consumeAiRequestSlot` transactionally burns 1 request.
   - An `AIRequestCompleted` event (including token usage and calculated USD cost) is emitted.
6. `OpsInsightService` returns the insight text and source counts to the client.

*Key takeaway:* Internal features are treated as zero-trust API clients. They do not hold raw vendor keys; they must pass through the governed proxy which protects quota and guarantees auditing.

## 4. Payment Simulate → Apply Plan Once

**Trigger:** `POST /v1/billing/webhooks/stripe` (or Paystack / simulate endpoint)

1. `BillingController` receives a signed webhook payload.
2. `BillingService.processWebhook` extracts the `providerEventId`, `tenantId`, and `planId`.
3. A Prisma transaction opens:
   - It queries `WebhookEvent` for `providerEventId`.
   - **Idempotency check**: If found, it returns `200 OK` and skips all logic.
   - If not found, it inserts the `WebhookEvent` row to lock the ID.
   - `EntitlementsService.applyPlan` is called, mapping the catalog plan limits (e.g., Growth = 10 apps, 100 AI requests) onto the `TenantEntitlement` record.
   - A `PaymentSucceeded` domain event is emitted.
4. Transaction commits.

*Key takeaway:* A verified, idempotent webhook is the sole mutator of a tenant's billing tier. The hosting and AI systems remain completely decoupled from Stripe.

## 5. Image Workload → Agent Compose

**Trigger:** `POST /v1/applications` with `dockerImage` (API, optional worker command, Postgres, Redis)

1. The API validates the image, worker command, and env. It rejects tenant overrides of `DATABASE_URL` and `REDIS_URL`.
2. The row stays `pending`. The Nest tick does not mark it `running`.
3. The Go agent generates Compose: API and worker from the same image, Postgres and Redis on a private network, Traefik only on the API.
4. The agent writes credentials into env files, probes the health path, then sets `running`. A failed probe tears the stack down and sets `failed`.

*Key takeaway:* The hosted app does not import AetherHost. The platform owns the process graph and the datastore URLs.
