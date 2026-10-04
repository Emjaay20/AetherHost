# AetherHost

A multi-runtime hosting platform control plane, built for digital agencies that need to manage WordPress, Node.js, and Python deployments alongside metered AI tools, all governed by strict unified quotas.

## The Problem
Agencies often string together disparate services for hosting, billing, and internal AI tools. AetherHost provides a unified control plane where commercial entitlements are the source of truth for both physical compute (provisioning apps) and digital API usage (AI requests), ensuring that tenants can never exceed their purchased plan limits.

📖 **Read the full architectural [Case Study](docs/CASE_STUDY.md)**

## The Constraints
- **Solo/Cheap:** Built to run locally and be easily deployed without a massive Kubernetes footprint.
- **Honesty:** Stubbing out physical clusters (like AWS/K8s) and actual payment cards, but building the *exact control paths* (idempotent webhooks, atomic quotas, proxy adapters) that would talk to them in production.

## Architecture

```text
Dashboard (Next.js)      External Webhooks (Stripe/Paystack)
        │                                │
        ▼                                ▼
┌────────────────────────────────────────────────────────┐
│                      Control Plane (NestJS)            │
│                                                        │
│  [Billing] ──(applies)──> [Entitlements] ──(governs)─┐ │
│                               ▲         ▲            │ │
│  [Applications] ──────(burns)─┘         │            │ │
│                                         │            │ │
│  [AI Proxy] ──────────(burns)───────────┘            │ │
│       │                                                │
│       └─> [Ops Insight] (Internal feature)             │
└────────────────────────────────────────────────────────┘
        ▲                                │
        │ (polls pending apps)           ▼
[Go Agent / Workers]             [PostgreSQL (Prisma)]
```

## Key Decisions

| ADR | Decision |
|---|---|
| `001` | **Modular Monolith First**: Keep domains separate in NestJS to allow future service extraction. |
| `002` | **Dashboard as Agency Control Plane**: Next.js UI is strictly for agency owners to view apps and events. |
| `003` | **Strict Application Entitlements**: Quota checks gate the creation of any new application. |
| `004` | **Postgres & Prisma Persistence**: Reliable relational storage for core state and event logs. |
| `005` | **Domain Events over Direct Calls**: Decouple provisioning from quota by publishing internal events. |
| `006` | **Atomic Entitlement Consume**: Prevent overselling by utilizing a single SQL `UPDATE ... WHERE usage < limit`. |
| `007` | **Separate Provisioning from Create**: App creation is fast; provisioning is asynchronous. |
| `008` | **Provisioner Stub Before Agents**: Verify architecture synchronously before writing out-of-process workers. |
| `009` | **Runtime Provisioner Strategy**: Factory pattern abstracting the differences between Node, WP, and Python. |
| `010` | **Go Agent Worker**: Out-of-process worker polling for pending tasks; proving language agnosticism. |
| `011` | **Governed AI Proxy**: All AI features must route through an internal proxy to enforce usage quota. |
| `012` | **Ops Insight Uses Proxy**: A product feature that summarizes operational state, governed exactly like compute. |
| `013` | **Swappable Model Adapters**: Safely swap a zero-cost local stub for real LLM providers (e.g. OpenAI). |
| `014` | **Payments Apply Plans**: Webhooks idempotently upgrade catalog plans without coupling to core logic. |

## Real vs. Stub

| Feature | Status | Explanation |
|---|---|---|
| **Control Plane API** | **Real** | Full NestJS domain, transactions, atomic locking, endpoints. |
| **Persistence** | **Real** | Postgres via Prisma. Survives restarts. |
| **Quotas & Entitlements** | **Real** | Strict enforcement using atomic SQL statements. |
| **Payment Webhooks** | **Real** | HMAC verification (Stripe / Paystack / Bachs). Unique `providerEventId` is the replay lock. `/simulate` is off unless `BILLING_ALLOW_SIMULATE=true`. |
| **Go Agent Worker** | **Real** | Polling worker built in Go that interacts with the API via HTTP. |
| **Actual Hosting (Servers)** | **Stubbed** | Emits successful `ApplicationStatusChanged` events instead of running Terraform/SSH. |
| **AI LLM Gateway** | **Stubbed** | Fully functional model factory, defaults to a zero-cost local string stub unless OpenAI keys are provided. |
| **Stripe/Paystack Dashboard** | **Stubbed** | Skips the redirect to Stripe Checkout, allowing API simulation of the webhook payload instead. |

## How to Run

1. **Start the Database**
   ```bash
    docker compose up -d
    cd apps/api && pnpm prisma migrate deploy
   ```
2. **Start the Control Plane API**
   ```bash
   cd apps/api
   pnpm install
   pnpm start:dev
   ```
3. **Start the Dashboard**
   ```bash
   cd apps/dashboard
   pnpm install
   pnpm dev -p 3002
   ```
4. **Simulate a Plan Upgrade (local only)**  
    Requires `BILLING_ALLOW_SIMULATE=true` in the API env.
    ```bash
    curl -s -X POST http://127.0.0.1:3000/v1/billing/simulate \
      -H "Content-Type: application/json" \
      -d '{"tenantId":"YOUR_CLERK_USER_ID","planId":"growth","provider":"paystack","providerEventId":"evt_test_1"}'
    ```

## Failure Modes Handled

1. **Race Conditions on Quota**: Multiple rapid clicks cannot bypass limits due to atomic SQL `UPDATE ... WHERE usage < limit`.
2. **Payment Webhook Replays**: `WebhookEvent` unique constraints guarantee a webhook payload is never processed twice (strict idempotency).
3. **AI Provider Failures**: The proxy authorizes first, calls the LLM, and only meters on success. A provider 500 error will not burn the tenant's AI request quota.
4. **Eventual Consistency**: Provisioning failures (when real) will not roll back the commercial transaction; the app simply remains `PENDING` for a retry.

---
> *"The control plane is honest: entitlements own commercial truth, workers are replaceable, AI is proxied, payments are idempotent. Probes exist; managed Postgres + container orchestration is the next apply."*

### Recent Architectural Hardening
- **Message Queues (BullMQ + Redis):** Webhooks are completely decoupled from HTTP ingestion. Stripe/Paystack/Bachs webhooks are dropped onto a Redis-backed BullMQ queue, ensuring zero data loss during high load or database contention.
- **Accurate Token Metering:** The AI gateway now uses the official `js-tiktoken` (cl100k_base BPE) to accurately meter streaming LLM responses down to the byte-pair, replacing naive length-based estimations.
- **SRE Orchestration (Go Agent):** The Go provisioning agent has been refactored to use the official Docker Go SDK (`github.com/docker/docker/client`) and generates strictly-isolated Compose definitions, completely stripping execution of untrusted tenant payloads.
- **Graceful Shutdowns:** The Go agent leverages native OS signal handlers and `context.Context` to safely finish active provisioning jobs before shutting down, preventing zombie containers during deployments.

### What's Next
- Infrastructure-as-code (Terraform) for managed Postgres + container orchestration
- SLO targets and observability dashboards once deployed to a real environment
- WordPress fleet provisioning via multi-container Compose stacks
