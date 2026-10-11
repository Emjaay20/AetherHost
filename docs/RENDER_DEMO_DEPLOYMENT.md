# ⚡ Deploying AetherHost to Render (Quick Demo Mode)

This guide explains how to deploy **AetherHost** to [Render](https://render.com) in ~3 minutes to demonstrate the platform to friends, clients, or investors before moving to your production **Contabo VPS**.

---

## 🔍 How Render Demo Mode Works vs. Contabo VPS

AetherHost is itself a container orchestrator (like Render or Railway) that uses its Go Agent (`apps/agent-go`) and Traefik to spawn Docker containers via `/var/run/docker.sock` and route wildcard subdomains (`*.yourdomain.com`).

Because Render runs web services inside unprivileged containers without a Docker daemon (`/var/run/docker.sock`) or wildcard subdomain routing, AetherHost includes a built-in **Cloud Demo Mode (`DEMO_MODE=true`)** designed specifically for Render demonstrations:

| Feature | Render (`DEMO_MODE=true`) | Contabo VPS (`docker-compose.prod.yml`) |
|---|---|---|
| **Marketing Site & Clerk Auth** | ✅ Full Production | ✅ Full Production |
| **Multi-Tenant SQL Quotas & Billing** | ✅ Full Production (Render Postgres) | ✅ Full Production |
| **Superadmin Governance Console** | ✅ Full Production | ✅ Full Production |
| **Groq AI Architect Code Synthesis** | ✅ Full Production (`openai/gpt-oss-120b`) | ✅ Full Production |
| **GitHub Repo Creation & Commits** | ✅ Full Production | ✅ Full Production |
| **Deployment Terminal Logs** | ✅ Automated Live Build & Health Probe Stream | ✅ Real Docker Engine Build Stream |
| **Split-View Live Preview & "Visit"** | ✅ Built-in Cloud Preview Route (`/preview/<app>`) | ✅ Isolated Docker Container + Traefik SSL (`<app>.yourdomain.com`) |

---

## 🚀 3-Step Render Deployment (Using Blueprint)

### Step 1: Push Changes to GitHub
Commit and push the repository (which includes [`render.yaml`](../render.yaml)) to your GitHub account:
```bash
git add .
git commit -m "feat: add Render Blueprint and Cloud Demo Mode"
git push origin main
```

### Step 2: Create Blueprint on Render
1. Log in to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** &rarr; **Blueprint**.
3. Connect your **AetherHost** GitHub repository.
4. Render will automatically detect `render.yaml` and prepare 4 resources:
   * `aetherhost-db` (PostgreSQL 16)
   * `aetherhost-redis` (Render Key Value / Redis)
   * `aetherhost-api` (NestJS Control Plane API)
   * `aetherhost-dashboard` (Next.js 16 Dashboard & Cloud Preview Engine)

### Step 3: Enter Your 3 API Keys
Render will prompt you for the following environment variables before deploying:

* **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`** (and `CLERK_PUBLISHABLE_KEY`): Your Clerk publishable key (`pk_test_...` or `pk_live_...`).
* **`CLERK_SECRET_KEY`**: Your Clerk secret key (`sk_test_...` or `sk_live_...`).
* **`GROQ_API_KEY`**: Your Groq API key (`gsk_...`) for the AI Architect & AI Debugger.
* *(Optional)* **`ADMIN_TENANT_IDS`**: Your Clerk User ID (`user_...`) to unlock the `/admin` Superadmin Console during your demo.

Click **Apply** and wait ~3 minutes for the build to complete!

---

## 🎬 What to Show Your Friend in the Demo

Once `aetherhost-dashboard` is live at `https://aetherhost-dashboard-xxxx.onrender.com`:

1. **Sign In & Explore the Console**: Sign in via Clerk to land on the multi-tenant workspace.
2. **Create an App or Prompt the AI Architect**:
   * Create a Node.js or Python app, or use the **AI Provisioning Prompt** on the dashboard.
   * Expand the **Deployment Logs** drawer to watch live timestamps stream as the container builds, runs readiness probes on `/health`, and transitions from `Pending` &rarr; `Running`.
3. **Open the Split-View AI Studio**:
   * Click **AI Architect** on any running app.
   * Show the **Live Interactive Preview** alongside the **Source Files** code inspector, and toggle between **Desktop**, **Tablet**, and **Mobile** viewports.
   * Type a prompt (e.g., *"Redesign the homepage into a dark-mode crypto portfolio tracker with interactive stats"*), click **Generate & Deploy**, and watch the live preview automatically reload with the newly synthesized UI!
4. **Upgrade Plans & Admin Governance**:
   * Visit `/billing` to demonstrate Starter, Pro, and Max tier upgrades.
   * Visit `/admin` (with your Clerk User ID in `ADMIN_TENANT_IDS`) to demonstrate tenant management, plan overrides, and platform telemetry.

---

## 🔄 Moving to Contabo VPS Later in the Week

Nothing in `render.yaml` or `DEMO_MODE` alters your Contabo production workflow. When you are ready to deploy to your Contabo VPS:
1. Follow [`docs/CONTABO_DEPLOYMENT.md`](./CONTABO_DEPLOYMENT.md).
2. Because `DEMO_MODE` is not set in `docker-compose.prod.yml`, your Contabo VPS will automatically use the native Go Agent (`agent-go`), real Docker Engine containers, and Traefik wildcard Let's Encrypt SSL.
