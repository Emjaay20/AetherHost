# 📘 AetherHost Enterprise Customer Onboarding Playbook (30-Day Journey)

**Role:** Senior Customer Success Manager — EMEA  
**Target Portfolio:** 80–100 Enterprise Accounts  
**Core Objective:** Drive rapid Time-to-Value (TTV < 5 minutes), ensure 100% technical adoption, prevent early churn, and establish expansion readiness.

---

## 🎯 1. Executive Summary & Goals

The first 30 days dictate enterprise customer retention. This playbook outlines the technical and operational roadmap for onboarding enterprise engineering teams onto AetherHost.

| Objective | Target Metric | Tooling & Integration |
| :--- | :--- | :--- |
| **Time-to-Value (TTV)** | $< 5$ minutes to first live workload | GitHub OAuth + Traefik Auto-Ingress |
| **Executive Alignment** | Kickoff completed within 48h of signature | **Chili Piper Form Concierge** |
| **Technical Health** | Health Index $> 85/100$ by Day 14 | AetherHost CSM Telemetry + SFDC Sync |
| **Expansion Readiness** | Commercial expansion flag identified by Day 30 | Salesforce Standard & Custom Objects |

---

## 📅 2. The 30-Day Milestone Journey

### Phase 1: Inbound Lead Qualification & Kickoff (Day 0 – Day 2)
1. **Automated Scheduling via Chili Piper:**
   - Prospect submits Enterprise Onboarding form.
   - Chili Piper intercepts the form via `ChiliPiper.submit()`, qualifies lead against EMEA territory routing, and books a 30-minute Kickoff Session directly on the CSM's calendar.
   - Chili Piper fires `meeting.booked` webhook to `POST /v1/webhooks/chilipiper`, updating AetherHost telemetry and creating a Salesforce Task for the assigned CSM.
2. **Pre-Call Diagnostics:**
   - Review customer tech stack (Node.js, Go, Rust, Python).
   - Verify customer VPC, custom domain names, and SSL requirements.

### Phase 2: Technical Kickoff & Architecture Review (Day 3 – Day 7)
* **Agenda (30 Mins via Zoom/Google Meet):**
  - **00-05m:** Introductions, alignment on Mutual Action Plan (MAP) goals.
  - **05-15m:** Technical Architecture deep dive (Traefik edge routing, HTTP readiness probes, container limits).
  - **15-25m:** Live Walkthrough: Connecting first GitHub repo and deploying first service live to `*.aetherhost.app`.
  - **25-30m:** Q&A, next steps, Slack Connect channel setup.
* **Success Criteria:** First test container running with green readiness probes. Time-to-Value logged in AetherHost telemetry.

### Phase 3: Production Migration & Domain Setup (Day 8 – Day 21)
1. **Custom Domain & TLS Ingress:**
   - Configure DNS CNAME records to `edge.aetherhost.io`.
   - Validate Let's Encrypt automated ACME HTTP-01 challenge completion.
2. **Team Provisioning & RBAC:**
   - Onboard customer engineering team via Clerk SSO / GitHub organization sync.
   - Configure resource quota allocations per developer workspace.

### Phase 4: Business Review & Expansion Handoff (Day 22 – Day 30)
1. **First Value Realization Review:**
   - Deliver monthly telemetry report (Deployment frequency, uptime percentage, cost savings vs AWS/Render).
2. **AE Commercial Handoff:**
   - If tenant quota utilization exceeds **80%**, the CSM triggers the internal `Flag AE Upsell` action, pushing a pre-qualified Salesforce Opportunity to the Account Executive team.

---

## 📊 3. Mutual Action Plan (MAP) Template

| Phase | Milestone Task | Owner | Due Date | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Discovery** | Complete Architecture Worksheet | Customer Lead | Day 2 | ✅ Completed |
| **Kickoff** | 30-min Technical Onboarding Call | AetherHost CSM | Day 3 | ✅ Completed |
| **POC** | Deploy 1st Microservice | Joint | Day 5 | ✅ Completed |
| **Production** | Point Custom Domain DNS (CNAME) | Customer DevOps | Day 12 | 🔄 In Progress |
| **Adoption** | Onboard 5+ Developers to Workspace | Customer Lead | Day 18 | ⏳ Scheduled |
| **Value Review** | Day 30 Executive Health Check | AetherHost CSM | Day 30 | ⏳ Scheduled |
