# Case Study: AetherHost

**A multi-runtime hosting platform control plane designed for commercial truth, system decoupling, and infrastructure scale.**

## Overview
AetherHost was built to solve a fundamental problem in agency hosting: loosely connected infrastructure tools failing to communicate effectively with billing systems. By centralizing the control plane, AetherHost enforces strict, atomic commercial gating (Entitlements) over any resource (physical compute or API consumption) without deeply coupling the business logic to external payment providers or underlying orchestrators.

## Key Outcomes

### 1. Atomic Entitlements & Commercial Truth
Instead of merely hoping billing webhooks stay in sync with application usage, AetherHost guarantees it. Quota consumption executes as atomic SQL updates (`UPDATE ... WHERE usage < limit`), completely preventing race conditions and overselling even during rapid, concurrent API requests.

### 2. Zero-Trust Internal AI Proxy
The platform features a governed internal LLM proxy that enforces strict quota checks before firing out to the provider (using a Swappable Model Adapter).
- **Resilience:** Because metering happens transactionally *only after a successful response*, a 500 error from OpenAI or Anthropic will never burn a tenant's purchased quota.

### 3. Asynchronous Worker Architecture
Compute deployment was explicitly abstracted. The NestJS API acts as the transactional system of record. Out-of-process workers (written in Go) continuously poll for pending workloads.
- **Contract Enforcement:** The worker operates strictly via the HTTP API. It is not permitted to mutate quota or status directly against the database, preserving the domain boundary.

### 4. Idempotent Revenue Streams
Payment integrations (Stripe, Paystack) act purely as catalog adapters. The `/v1/billing/webhooks` handlers are fiercely idempotent—extracting a unique `providerEventId` and storing it via a transactional `WebhookEvent` table. Webhook replays are safely ignored, entirely preventing double-grants of quota.

### 5. SRE-Driven Probes & IaC Intent
Distinguished explicitly between liveness (`/v1/health` for process state) and readiness (`/v1/ready` for PostgreSQL connectivity) to prevent catastrophic cascading container restarts. The intended infrastructure footprint (Alibaba ACK/ECS + Managed PostgreSQL) is documented in a Terraform skeleton.

## Conclusion
AetherHost isn't a mock WordPress deployment tool. It's a senior-level architectural proof of concept demonstrating how to orchestrate distributed systems, asynchronous event flows, rigorous API boundaries, and bulletproof billing cycles.
