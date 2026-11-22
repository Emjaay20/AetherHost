# AetherHost Technical Documentation Index

Welcome to the AetherHost technical documentation repository. This directory houses architectural specifications, security threat models, disaster recovery runbooks, architecture decision records (ADRs), and request for comments (RFCs).

---

## 1. Quick Navigation by Subsystem

| Domain | Key Documents | Summary |
|---|---|---|
| **Security & DevSecOps** | [docs/security/threat-model.md](../docs/security/threat-model.md)<br>[docs/security/controls.md](../docs/security/controls.md)<br>[docs/security/disaster-recovery-drill.md](../docs/security/disaster-recovery-drill.md) | STRIDE threat model, internal control mapping, application-bound AES-GCM encryption, and isolated database recovery tooling. |
| **Rust Platform Engineering** | [docs/architecture/PLATFORM_ENGINEERING.md](../docs/architecture/PLATFORM_ENGINEERING.md)<br>[docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md](../docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md) | In-memory RBAC/ABAC authorization, server-owned service identity, W3C distributed tracing, Axum and Actix-web library middleware, and Criterion benchmark tooling. |
| **AI Agents & MCP** | [AGENTS.md](../AGENTS.md) | Developer & AI Agent Guide for Claude Code, Cursor, and Antigravity via embedded `aether mcp` stdio JSON-RPC server. |
| **Operations & CI/CD** | [docs/OPERATIONS.md](../docs/OPERATIONS.md)<br>[docs/CONTABO_DEPLOYMENT.md](../docs/CONTABO_DEPLOYMENT.md)<br>[deploy/KUBERNETES.md](../deploy/KUBERNETES.md) | Fast CI loops (`nextest`, path filtering, `cargo-deny`), KinD Kubernetes validation, and production Contabo VPS hosting. |
| **Staff Case Studies** | [docs/portfolio/staff-security-case-study.md](../docs/portfolio/staff-security-case-study.md)<br>[docs/CASE_STUDY.md](../docs/CASE_STUDY.md) | End-to-end platform overhaul, deduplicated Restic backup pipeline, and incident post-mortems. |
| **Editorial integrations** | [AetherPress Intelligence Hub](demos/aetherpress-intelligence-hub.md)<br>[Spacefast external frontend](integrations/spacefast-external-frontend.md) | A review-first WordPress + SmartCrawler workflow with an optional private Spacefast static frontend. |
| **Customer experience** | [Customer Experience & Production Readiness](customer-success/AETHERHOST_CX_PRODUCTION_READINESS.md)<br>[Customer onboarding playbook](customer-success/ONBOARDING_PLAYBOOK.md) | Source-first deployment, truthful operational state, customer acceptance criteria, and the phased roadmap to self-service hosting. |

---

## 2. Architecture & Design Decisions

### Architecture Decision Records (ADRs)
Found in [`docs/architecture/adr/`](../docs/architecture/adr/):
- **[ADR 021](../docs/architecture/adr/021-unified-in-memory-authz-and-telemetry-in-rust-monolith.md)**: Unified In-Memory Authorization (RBAC/ABAC) and RED Telemetry for Platform Services.
- **[ADR 020](../docs/architecture/adr/020-spacefast-customer-oauth.md)**: Spacefast Customer OAuth Foundation.
- **[ADR 019](../docs/architecture/adr/019-operator-managed-external-frontend-publishing.md)**: Operator-Managed External Frontend Publishing.
- **[ADR 006](../docs/architecture/adr/006-atomic-entitlement-consume.md)**: Atomic Entitlement Consume via Single SQL Updates.
- **[ADR 001](../docs/architecture/adr/001-modular-monolith-first.md)**: Modular Monolith First (NestJS Control Plane).

### Requests for Comments (RFCs)
Found in [`docs/architecture/rfc/`](../docs/architecture/rfc/):
- **[RFC 001](../docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md)**: Proposed Rollout of In-Memory Authorization and Distributed Telemetry for an Actix-Web Service (Library middleware proved in `examples/actix_monolith.rs`, with planned shadow evaluation, canary routing, and Redis Pub/Sub invalidation).

---

## 3. Security & Compliance Standard

1. **Application Encryption ([docs/security/controls.md](../docs/security/controls.md))**:
   - AES-256-GCM authenticated cipher with 96-bit unique IVs per record and 128-bit integrity tags.
   - Master key isolation via environment variable; no raw secrets stored in PostgreSQL.

2. **Immutable Container Runtime**:
   - Platform services run with `read_only: true`, `cap_drop: [ALL]` and `no-new-privileges: true`; tenant workloads drop all capabilities.
   - Docker socket proxy restricts container management API access.

3. **Backup & Disaster Recovery ([docs/security/disaster-recovery-drill.md](../docs/security/disaster-recovery-drill.md))**:
   - Restic deduplicated repository using Content-Defined Chunking (CDC).
   - Isolated PostgreSQL restore and tenant-relationship checks are implemented. A real runtime result and full platform recovery measurement remain required.

4. **Supply Chain Enforcement**:
   - Gitleaks automated secret detection.
   - Trivy container & filesystem vulnerability scans.
   - Checkov Terraform static security auditing.
   - `cargo-deny` strict dependency, license (MIT, Apache-2.0, MPL-2.0), and advisory enforcement.

---

## 4. Web Documentation

The interactive documentation portal is hosted at `/docs` (implemented in [`apps/dashboard/app/docs/DocsClient.tsx`](../apps/dashboard/app/docs/DocsClient.tsx)), providing real-time search, code snippets, and deployment guides.


## Security implementation and rollout

Start with [the control map](security/controls.md), [rollout checklist](security/rollout.md),
[key rotation](security/key-rotation.md), [secure access](security/secure-access.md),
[vulnerability lifecycle](security/vulnerability-management.md), and
[incident exercise](security/incident-exercise.md). The `/docs` page summarizes
these controls without claiming completed external activation or audited compliance.

Latest local results: [19 November security validation](validation/2026-11-19-infrastructure-security.md).
