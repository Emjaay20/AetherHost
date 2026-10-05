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
Dashboard (Next.js)      External Webhooks (Bachs / Paystack)
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
| `003` | **Entitlements as Gatekeeper**: Quota checks gate the creation of any new application. |
| `004` | **Postgres & Prisma Persistence**: Reliable relational storage for core state and event logs. |
| `005` | **Prisma Version Pinning**: Pin Prisma to v5.21 to avoid migration-breaking upgrades. |
| `006` | **Atomic Entitlement Consume**: Prevent overselling by utilizing a single SQL `UPDATE ... WHERE usage < limit`. |
| `007` | **Events are the Provisioning Contract**: Decouple provisioning from quota by publishing domain events. |
| `008` | **Provisioner Stub Before Agents**: Verify architecture synchronously before writing out-of-process workers. |
| `009` | **Runtime Provisioner Strategy**: Factory pattern abstracting the differences between Node, WP, and Python. |
| `010` | **Go Agent Polls Control Plane**: Out-of-process worker polling for pending tasks; proving language agnosticism. |
| `011` | **LLM Proxy First**: All AI features must route through an internal proxy to enforce usage quota. |
| `012` | **Ops Insight Uses Proxy**: A product feature that summarizes operational state, governed exactly like compute. |
| `013` | **Swappable Model Adapters**: Safely swap a zero-cost local stub for real LLM providers (e.g. OpenAI). |
| `014` | **Payments Apply Plans**: Webhooks idempotently upgrade catalog plans without coupling to core logic. |
| `015` | **Liveness vs. Readiness Probes**: Separate health endpoints for orchestrators; IaC skeleton for future deploys. |
| `016` | **Workload Contract**: An image deploy is API + optional worker + private Postgres/Redis. The agent renders Compose and probes health. |

## Real vs. Stub

| Feature | Status | Explanation |
|---|---|---|
| **Control Plane API** | **Real** | Full NestJS domain, transactions, atomic locking, endpoints. |
| **Persistence** | **Real** | Postgres via Prisma. Survives restarts. |
| **Quotas & Entitlements** | **Real** | Strict enforcement using atomic SQL statements. |
| **Payment Webhooks** | **Real** | HMAC verification for Bachs and Paystack. Checkout is Bachs only. Stripe Checkout is not wired. `/simulate` is off unless `BILLING_ALLOW_SIMULATE=true`. |
| **Invoicing** | **Real** | `Invoice` records created on plan upgrades with accurate `amountCent` from catalog. |
| **Bandwidth Metering** | **Real** | Per-tenant `usageBandwidthMb` / `limitBandwidthGb` tracked in entitlements. |
| **Authentication (Clerk)** | **Real** | Clerk JWT verification on API guards + Next.js middleware. |
| **Dashboard (Next.js)** | **Real** | Agency control plane with app management, billing, admin panel, and event log. |
| **Go Agent Worker** | **Real** | Polling worker built in Go that interacts with the API via HTTP. |
| **CI Pipeline** | **Real** | `.github/workflows/ci.yml` runs API tests, the Go agent tests, and both builds on push to `main`. |
| **Actual Hosting (Servers)** | **Local only** | The Go agent renders Nginx, PHP-FPM, and MariaDB Compose on the Docker host. No public VPS, TLS, or Terraform. |
| **Image workloads** | **Local Docker** | One image can run as API + worker with private Postgres and Redis. The agent injects env and probes health before `running`. Not Kubernetes. |
| **AI LLM Gateway** | **Stubbed** | Fully functional model factory, defaults to a zero-cost local string stub unless OpenAI keys are provided. |
| **Bachs.io Checkout** | **Real** | Checkout sessions go to Bachs. Do not describe this as Stripe Checkout. |

## How to Run

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Start the Database**
   ```bash
   docker compose up -d
   pnpm -F @aetherhost/api prisma migrate deploy
   ```
3. **Start the Control Plane API**
   ```bash
   pnpm -F @aetherhost/api start:dev
   ```
4. **Start the Dashboard**
   ```bash
   pnpm -F dashboard dev
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
5. **Workload Health**: An image deploy is not `running` until the API health path answers. A failed probe tears the stack down.

---
> *"The control plane is honest: entitlements own commercial truth, workers are replaceable, AI is proxied, payments are idempotent. Probes exist; managed Postgres + container orchestration is the next apply."*

### Recent Architectural Hardening
- **Message Queues (BullMQ + Redis):** Bachs and Paystack webhooks are queued on BullMQ. A replay with the same `providerEventId` is ignored.
- **Accurate Token Metering:** The AI gateway now uses the official `js-tiktoken` (cl100k_base BPE) to accurately meter streaming LLM responses down to the byte-pair, replacing naive length-based estimations.
- **SRE Orchestration (Go Agent):** The agent polls the API and renders Compose. Image workloads get an API, a worker, and private Postgres/Redis. Tenant Compose is not executed.
- **Shutdown:** On SIGINT or SIGTERM the agent stops polling. An in-flight `docker compose up` is not cancelled.

### What's Next
- Infrastructure-as-code (Terraform) for managed Postgres + container orchestration
- SLO targets and observability dashboards once deployed to a real environment
- Production multi-node WordPress fleet orchestration

### Production Runbooks (Automattic Track)

#### 1. Host Nginx and TLS
This is not deployed. Hosting in this repo is local Docker. If you later put it on a VPS, terminate TLS on host Nginx and proxy to Traefik. Do not claim that server until it is yours.
```bash
# Install Host Nginx & Certbot
apt install nginx python3-certbot-nginx
certbot --nginx -d aetherhost.com -d *.aetherhost.com
# ProxyPass to Traefik on port 80
```


#### 2. Backup and restore
`apps/runtimes/wordpress/scripts/backup.sh` and `restore.sh` dump MariaDB and `wp-content`. No restore has been timed on a public VPS. Run `time ./apps/runtimes/wordpress/scripts/restore.sh <backup-dir>` yourself before quoting a number.
