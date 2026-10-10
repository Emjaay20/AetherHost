# AetherHost Contabo VPS Production Deployment Guide

This guide provides a comprehensive, production-tested roadmap for deploying **AetherHost** onto a **Contabo Cloud VPS** (Ubuntu Linux) with automated Let's Encrypt SSL/TLS, wildcard DNS routing, isolated database networking, and Lovable-style AI application synthesis.

---

## 1. Architecture Overview on Contabo

```
                         Internet Traffic
                                │
                 ┌──────────────▼──────────────┐
                 │    Public Wildcard DNS      │
                 │    *.yourdomain.com         │
                 └──────────────┬──────────────┘
                                │ Ports 80 & 443
                 ┌──────────────▼──────────────┐
                 │     Traefik Edge Proxy      │
                 │  - Auto Let's Encrypt TLS   │
                 │  - HTTP -> HTTPS Redirect   │
                 └──────┬──────────────┬───────┘
                        │              │
      ┌─────────────────┴─┐          ┌─┴─────────────────┐
      │   console.domain  │          │    api.domain     │
      │ Next.js Dashboard │          │ NestJS API Server │
      └───────────────────┘          └─────────┬─────────┘
                                               │
     ┌─────────────────────────────────────────┼────────────────────────┐
     │ Internal Docker Network (aetherhost-net)│                        │
     │                                         │                        │
     │  ┌──────────────┐   ┌─────────────┐   ┌─▼───────────┐            │
     │  │  PostgreSQL  │   │    Redis    │   │ Go Agent    ├──────┐     │
     │  │ (No pub IP)  │   │(Passworded) │   │ Orchestrator│      │     │
     │  └──────────────┘   └─────────────┘   └─────────────┘      │     │
     │                                                            │     │
     │  ┌────────────────────────────────────────────────────────┐│     │
     │  │  Tenant Applications (Auto-provisioned via AI)         ││     │
     │  │  my-node-backend.yourdomain.com                        ││     │
     │  │  python-service.yourdomain.com       ◄─────────────────┘│     │
     │  └─────────────────────────────────────────────────────────┘     │
     └──────────────────────────────────────────────────────────────────┘
```

---

## 2. Pre-Deployment Checklist (What to Do Before Deploying)

Before touching the server, complete these 5 prerequisite steps:

### A. Domain & Wildcard DNS Configuration
Every application hosted on AetherHost gets a custom subdomain (e.g., `my-node-backend.yourdomain.com`).
1. Access your DNS provider (Cloudflare, Namecheap, GoDaddy, Porkbun, etc.).
2. Add the following **A Records** pointing to your **Contabo VPS IPv4 Address**:
   - `A` `yourdomain.com` &rarr; `<CONTABO_VPS_IP>`
   - `A` `*.yourdomain.com` (Wildcard) &rarr; `<CONTABO_VPS_IP>`
3. *Note for Cloudflare users:* Set SSL/TLS mode to **Full** or **Full (Strict)** in Cloudflare SSL Settings, and ensure DNS records are set to **DNS Only (Grey Cloud)** if you want Traefik to handle Let's Encrypt certificates directly via HTTP-01 challenge.

### B. Clerk Production Authentication
1. Go to your [Clerk Dashboard](https://dashboard.clerk.com).
2. Under **Configure** &rarr; **Domains**:
   - Add `console.yourdomain.com` and `yourdomain.com` to Authorized Domains / Origins.
   - Redirect URL after sign-in: `https://console.yourdomain.com/console`.
3. Copy your live API keys:
   - `CLERK_PUBLISHABLE_KEY` (`pk_live_...`)
   - `CLERK_SECRET_KEY` (`sk_live_...`)

### C. Groq AI API Key
1. Verify that your `GROQ_API_KEY` has access to the high-performance model:
   - `GROQ_MODEL=openai/gpt-oss-120b`

### D. GitHub OAuth (Push-to-Deploy)
1. Ensure the Clerk GitHub OAuth provider has permissions for repository management (`repo`, `admin:repo_hook`).
2. Webhook endpoint URL:
   - `https://api.yourdomain.com/v1/webhooks/github`

---

## 3. Recommended Contabo VPS Specifications

For smooth operation of the control plane and concurrent container workloads:

| Tier | vCPU | RAM | Storage | Recommended For |
|---|---|---|---|---|
| **Cloud VPS 1** | 4 Cores | 8 GB | 75 GB NVMe | Starter / Staging (up to 15 tenant containers) |
| **Cloud VPS 2** *(Recommended)* | 6 Cores | 16 GB | 150 GB NVMe | Production (up to 50 tenant containers) |
| **Cloud VPS 3** | 8 Cores | 24 GB | 300 GB NVMe | High scale production with many databases |

- **Operating System:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (64-bit).

---

## 4. Step-by-Step Server Setup

### Step 1: Connect to your Contabo VPS via SSH
```bash
ssh root@<YOUR_CONTABO_IP>
```

### Step 2: Run the Automated Bootstrap Script
AetherHost includes a turnkey setup script ([deploy/setup-contabo.sh](file:///Users/yusufabubakar/Documents/AetherHost/deploy/setup-contabo.sh)) that configures:
- Essential system packages (`ca-certificates`, `curl`, `git`, `ufw`, `fail2ban`).
- **4GB NVMe Swap space** (prevents kernel Out-Of-Memory kills during container builds).
- Official **Docker CE & Docker Compose plugin**.
- **UFW Firewall hardening** (permits only ports 22, 80, 443; closes all database ports to the outside world).
- Traefik network bridge (`aetherhost-net`).

Clone and run:
```bash
mkdir -p /opt/aetherhost
git clone https://github.com/Emjaay20/AetherHost.git /opt/aetherhost
cd /opt/aetherhost
bash deploy/setup-contabo.sh
```

---

## 5. Configure Production Environment Variables

Copy the production environment template:
```bash
cp .env.production.example .env
nano .env
```

Set your values:
```ini
BASE_DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
HOST_PWD=/opt/aetherhost

POSTGRES_USER=aether
POSTGRES_PASSWORD=generate_a_super_strong_password_here_32chars
POSTGRES_DB=aetherhost

REDIS_PASSWORD=generate_a_strong_redis_password_here_32chars

AGENT_SECRET_KEY=generate_a_cryptographically_secure_agent_key_64chars

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

---

## 6. Build & Launch the Production Platform

### Step 1: Push Prisma Database Schema to Production Postgres
```bash
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml run --rm api pnpm prisma db push
```

### Step 2: Start All Services in Background
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 3: Verify Running Services
```bash
docker compose -f docker-compose.prod.yml ps
```
You should see 5 healthy running services:
- `aetherhost-traefik` (listening on 80 and 443)
- `aetherhost-postgres` (listening on 127.0.0.1:5432 only)
- `aetherhost-redis` (listening on 127.0.0.1:6379 only)
- `aetherhost-api` (routed via `api.yourdomain.com`)
- `aetherhost-dashboard` (routed via `console.yourdomain.com`)
- `aetherhost-agent` (connected to Docker socket)

---

## 7. Verifying SSL Certificates & Health Checks

Test that Let's Encrypt automatically issued your certificates:
```bash
# Test API SSL
curl -I https://api.yourdomain.com/v1/health

# Test Dashboard Console SSL
curl -I https://console.yourdomain.com/
```

Both should return `HTTP/2 200` with valid Let's Encrypt SSL certificates!

---

## 8. Zero-Downtime Blue/Green Deployments & Probing

In AetherHost:
1. When a user prompts the AI Architect or pushes to GitHub, the Go Agent launches the new container image.
2. The agent probes container HTTP readiness on port 3000 before updating Traefik routing.
3. If an application takes time to install dependencies (e.g. `pip install` or `npm install`), Traefik does not route traffic until the container responds with `200 OK`.
4. This completely eliminates 502 Bad Gateway race conditions.

---

## 9. Live Log Streaming in Production

- All build steps, container stdout/stderr, and health checks are posted directly to `POST /v1/applications/:id/logs`.
- Users can view real-time streaming logs from the dashboard at `https://console.yourdomain.com/console` for:
  - **Pending apps:** Live streaming build logs with auto-scroll.
  - **Running apps:** Container stdout/stderr.
  - **Failed apps:** AI Root-Cause Debugger with 1-click explanation.

---

## 10. Automated Maintenance & Backups (Cron)

Set up a daily cron job to back up the database and prune old Docker build caches.

Run `crontab -e` and add:
```bash
# Daily PostgreSQL backup at 03:00 AM
0 3 * * * docker exec aetherhost-postgres pg_dump -U aether aetherhost | gzip > /opt/aetherhost/backups/aetherhost_$(date +\%Y\%m\%d).sql.gz

# Weekly Docker cleanup at 04:00 AM on Sunday (removes dangling images older than 7 days)
0 4 * * 0 docker image prune -af --filter "until=168h"
```

Create the backup directory:
```bash
mkdir -p /opt/aetherhost/backups
chmod 700 /opt/aetherhost/backups
```

---

## 11. Security Checklist Summary

- [x] **No public database ports:** Ports 5432 and 6379 are bound to `127.0.0.1` and internal network only.
- [x] **UFW Firewall active:** Only 22, 80, and 443 are open.
- [x] **Fail2Ban active:** Protects against SSH brute-force attempts.
- [x] **HTTPS enforcement:** All HTTP port 80 traffic automatically redirects to port 443 TLS.
- [x] **Swap space active:** 4GB swap prevents memory exhaustion crashes.
- [x] **Internal agent authentication:** `x-agent-key` header with high-entropy secret.
