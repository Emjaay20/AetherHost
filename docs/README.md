# AetherHost Technical Documentation Index

Welcome to the AetherHost technical documentation repository. This directory houses architectural specifications, security threat models, disaster recovery runbooks, architecture decision records (ADRs), and request for comments (RFCs).

---

## 1. Quick Navigation by Subsystem

| Domain | Key Documents | Summary |
|---|---|---|
| **Security & DevSecOps** | [docs/security/threat-model.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/security/threat-model.md)<br>[docs/security/controls.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/security/controls.md)<br>[docs/security/disaster-recovery-drill.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/security/disaster-recovery-drill.md) | STRIDE threat model, internal control mapping, application-bound AES-GCM encryption, and isolated database recovery tooling. |
| **Rust Platform Engineering** | [docs/architecture/PLATFORM_ENGINEERING.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/PLATFORM_ENGINEERING.md)<br>[docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md) | In-memory RBAC/ABAC authorization, server-owned service identity, W3C distributed tracing, Actix-web middleware, and Criterion benchmark tooling. |
| **AI Agents & MCP** | [AGENTS.md](file:///Users/yusufabubakar/Documents/AetherHost/AGENTS.md) | Developer & AI Agent Guide for Claude Code, Cursor, and Antigravity via embedded `aether mcp` stdio JSON-RPC server. |
| **Operations & CI/CD** | [docs/OPERATIONS.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/OPERATIONS.md)<br>[docs/CONTABO_DEPLOYMENT.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/CONTABO_DEPLOYMENT.md)<br>[deploy/KUBERNETES.md](file:///Users/yusufabubakar/Documents/AetherHost/deploy/KUBERNETES.md) | Fast CI loops (`nextest`, path filtering, `cargo-deny`), KinD Kubernetes validation, and production Contabo VPS hosting. |
| **Staff Case Studies** | [docs/portfolio/staff-security-case-study.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/portfolio/staff-security-case-study.md)<br>[docs/CASE_STUDY.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/CASE_STUDY.md) | End-to-end platform overhaul, deduplicated Restic backup pipeline, and incident post-mortems. |

---

## 2. Architecture & Design Decisions

### Architecture Decision Records (ADRs)
Found in [`docs/architecture/adr/`](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/):
- **[ADR 021](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/021-unified-in-memory-authz-and-telemetry-in-rust-monolith.md)**: Unified In-Memory Authorization (RBAC/ABAC) and RED Telemetry in Rust Monolith.
- **[ADR 020](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/020-spacefast-customer-oauth.md)**: Spacefast Customer OAuth Foundation.
- **[ADR 019](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/019-operator-managed-external-frontend-publishing.md)**: Operator-Managed External Frontend Publishing.
- **[ADR 006](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/006-atomic-entitlement-consume.md)**: Atomic Entitlement Consume via Single SQL Updates.
- **[ADR 001](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/adr/001-modular-monolith-first.md)**: Modular Monolith First.

### Requests for Comments (RFCs)
Found in [`docs/architecture/rfc/`](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/rfc/):
- **[RFC 001](file:///Users/yusufabubakar/Documents/AetherHost/docs/architecture/rfc/RFC-001-monolith-authz-telemetry-rollout.md)**: Zero-Downtime Rollout of In-Memory Authorization and Distributed Telemetry across the Rust Monolith (Dark launch, shadow evaluation, canary routing, and Redis Pub/Sub invalidation mesh).

---

## 3. Security & Compliance Standard

1. **Application Encryption ([docs/security/controls.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/security/controls.md))**:
   - AES-256-GCM authenticated cipher with 96-bit unique IVs per record and 128-bit integrity tags.
   - Master key isolation via environment variable; no raw secrets stored in PostgreSQL.

2. **Immutable Container Runtime**:
   - Workloads run with `read_only: true`, `cap_drop: [ALL]`, and `no-new-privileges: true`.
   - Docker socket proxy restricts container management API access.

3. **Backup & Disaster Recovery ([docs/security/disaster-recovery-drill.md](file:///Users/yusufabubakar/Documents/AetherHost/docs/security/disaster-recovery-drill.md))**:
   - Restic deduplicated repository using Content-Defined Chunking (CDC).
   - Isolated PostgreSQL restore and tenant-relationship checks are implemented. A real runtime result and full platform recovery measurement remain required.

4. **Supply Chain Enforcement**:
   - Gitleaks automated secret detection.
   - Trivy container & filesystem vulnerability scans.
   - Checkov Terraform static security auditing.
   - `cargo-deny` strict dependency, license (MIT, Apache-2.0, MPL-2.0), and advisory enforcement.

---

## 4. Web Documentation

The interactive documentation portal is hosted at `/docs` (implemented in [`apps/dashboard/app/docs/DocsClient.tsx`](file:///Users/yusufabubakar/Documents/AetherHost/apps/dashboard/app/docs/DocsClient.tsx)), providing real-time search, code snippets, and deployment guides.


## Security implementation and rollout

Start with [the control map](security/controls.md), [rollout checklist](security/rollout.md),
[key rotation](security/key-rotation.md), [secure access](security/secure-access.md),
[vulnerability lifecycle](security/vulnerability-management.md), and
[incident exercise](security/incident-exercise.md). The `/docs` page summarizes
these controls without claiming completed external activation or audited compliance.

Latest local results: [19 November security validation](validation/2026-11-19-infrastructure-security.md).
