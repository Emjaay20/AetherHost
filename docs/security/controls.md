# AetherHost SOC 2 Control Mapping Matrix

> **Assessment Status:** Self-Assessed (Internal Pre-Audit Baseline)  
> **Target Framework:** AICPA Trust Services Criteria (SOC 2 Type II - Security, Availability, Confidentiality)  
> **Last Evaluated:** 15 November 2026

---

## 1. Common Criteria 6: Logical and Physical Access Controls

| TSC ID | Control Description | Implementation & Safeguards | Evidence in Repository / Infrastructure | Self-Assessed Status |
| :--- | :--- | :--- | :--- | :--- |
| **CC6.1** | Boundary Protection & Network Segmentation | Edge ingress managed by Traefik with automated Let's Encrypt TLS. Internal data stores (PostgreSQL 16, Redis 7) and Docker socket proxies reside on private Docker networks (`control-plane-net`) and are never exposed to public interfaces. | `docker-compose.prod.yml` (lines 60-120), `terraform/firewall.tf` | **Implemented** |
| **CC6.2** | User Registration and Access Least Privilege | Multi-tenant authentication delegated to Clerk. Tenant project files are strictly compartmentalized from the platform runtime (`/srv/aetherhost/projects` vs `/srv/aetherhost/control`). Deploy agent executes under non-root UID 1001 with read-only root mount. | `apps/agent-go/workload.go`, `docker-compose.prod.yml` (user `1001:1001`) | **Implemented** |
| **CC6.3** | Principle of Least Privilege in Runtime | Production containers enforce `read_only: true`, `cap_drop: [ALL]`, and `no-new-privileges:true`. Traefik routes through a dedicated discovery proxy that denies `BUILD`, `EXEC`, and `POST` calls to the Docker socket. | `docker-compose.prod.yml`, `docs/security/posture-log.md` | **Implemented** |
| **CC6.6** | Vulnerability Detection & Secret Scanning | Blocking CI gates: Gitleaks scans commit history for credential leaks; Trivy scans filesystem and dependency trees for High and Critical CVEs (`exit-code: 1`). | `.github/workflows/ci.yml`, `.gitleaksignore`, `.trivyignore` | **Implemented** |
| **CC6.7** | Supply Chain Integrity & Dependency Management | All GitHub Actions pinned to immutable 40-character commit SHAs. Dependabot monitors npm, Go, Cargo, and GitHub Actions dependencies weekly. Dashboard Dockerfile enforces `--frozen-lockfile`. | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `apps/dashboard/Dockerfile` | **Implemented** |

---

## 2. Common Criteria 7: System Operations & Change Management

| TSC ID | Control Description | Implementation & Safeguards | Evidence in Repository / Infrastructure | Self-Assessed Status |
| :--- | :--- | :--- | :--- | :--- |
| **CC7.1** | Infrastructure as Code & Baseline Configuration | Perimeter DNS, WAF filtering rules, and GitHub repository branch protections codified declaratively in Terraform. | `terraform/versions.tf`, `terraform/dns.tf`, `terraform/github.tf` | **Implemented** |
| **CC7.2** | Controlled Release Pipeline & CI Enforcement | Direct pushes to `main` prevented via branch protection. Commits require passing builds across TypeScript, Go agent, Rust crates, and security scans before merge. | `terraform/github.tf`, `.github/workflows/ci.yml` | **Implemented** |
| **CC7.3** | Incident Response & Root Cause Analysis | Formal postmortem process tracking timeline, root cause, containment, and preventive controls for platform anomalies. | `docs/incidents/2026-11-07-platform-overwrite.md` | **Implemented** |
| **CC7.4** | Audit Logging and Redaction | Administrative actions generate immutable `AuditLog` records. Sensitive headers, bearer tokens, and credentials in runtime application output are scrubbed by the log redaction layer. | `apps/api/src/common/logger/log-redaction.ts`, `prisma/schema.prisma` (`AuditLog`) | **Implemented** |

---

## 3. Availability Criteria (A1): Backup, Disaster Recovery & Redundancy

| TSC ID | Control Description | Implementation & Safeguards | Evidence in Repository / Infrastructure | Self-Assessed Status |
| :--- | :--- | :--- | :--- | :--- |
| **A1.2** | Off-Host Encrypted Backups | Daily automated backup of PostgreSQL database, tenant source, configuration, and Docker volumes using Restic with client-side encryption and content-defined chunk deduplication. Sent off-host to Google Drive via Rclone. | `deploy/backup/backup.sh`, `deploy/backup/GOOGLE_DRIVE_SETUP.md` | **Implemented** |
| **A1.3** | Automated Restore Verification & Recovery Drills | Weekly non-destructive restore check unit restores the latest off-host snapshot to a temporary directory and verifies database integrity. | `deploy/backup/restore-check.sh`, `aetherhost-restore-check.timer` | **Implemented** |
| **A1.4** | Operational Failure Alerting | Scheduled systemd units are wired with `OnFailure=aetherhost-operation-alert@%n.service` to trigger automated failure alerts. | `/etc/systemd/system/aetherhost-backup.service`, `deploy/systemd/` | **Implemented** |

---

## Summary & Gap Analysis

1. **Current Coverage:** 100% of the core foundational technical controls for access restriction, supply chain security, automated backups, and incident handling are active and verified in code.
2. **External Audit Readiness:** Transitioning from self-assessed to formal SOC 2 Type I/II certification requires engaging an accredited AICPA external auditor (e.g. via Vanta, Drata, or an independent CPA firm) and establishing continuous 90-day observation evidence.
