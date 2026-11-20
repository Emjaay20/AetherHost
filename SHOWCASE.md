# AetherHost: Senior / Staff DevSecOps Portfolio Showcase

This document is an architectural walkthrough and technical case study demonstrating senior-level security engineering, resilient platform operations, and DevSecOps excellence implemented within AetherHost.

---

## 🏛️ Executive Summary

AetherHost is a multi-tenant cloud hosting platform designed to isolate untrusted customer applications while providing automated container orchestration, AI code synthesis, and edge routing. 

As the platform grew, security and resilience were engineered as first-class architectural constraints rather than afterthoughts. This showcase highlights six pillars of production-grade DevSecOps:

```
                                  [Cloudflare DNS / Terraform]
                                               │
                                               ▼
                              [Traefik v3 Edge Ingress: read_only]
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   [Core Control Plane (NestJS)]                                    [Go Agent Orchestrator]
   ├── AES-256-GCM Envelope Vault                                   ├── Isolated Workspace Mounts
   ├── Strict Clerk JWT & Tenant Scoping                            ├── Path Traversal Enforcers
   └── Centralized Log Redaction                                    └── Docker Socket Proxy (RO)
               │                                                               │
               ▼                                                               ▼
   [PostgreSQL & Redis DB]                                          [Tenant Containers]
   ├── Encrypted envVars at rest                                    ├── read_only: true
   └── Immutable AuditLog Table                                     ├── cap_drop: [ALL]
                                                                    └── No Host Socket Mount
```

---

## 🔍 Key Engineering Case Studies

### 1. Incident Remediation: Restoring Backup CDC Deduplication
* **The Incident ([Postmortem](docs/incidents/2026-11-07-platform-overwrite.md)):** Following an operational recovery, automated Restic backups to cloud storage began failing with 4-hour systemd timeouts.
* **Root Cause Analysis:** The legacy backup script compressed directories using `tar -czf` prior to passing them to Restic. Gzip compression alters byte boundaries even for small file changes, destroying Restic's Rabin-Karp Content-Defined Chunking (CDC) deduplication and forcing full multi-gigabyte re-uploads across throttled cloud storage.
* **Engineering Solution:**
  1. Overhauled [backup.sh](deploy/backup/backup.sh) to stream PostgreSQL dumps uncompressed and synchronize volume trees (`/var/lib/docker/volumes/<vol>/_data`) via raw `rsync`.
  2. Restored native CDC deduplication: backup execution dropped from **> 4 hours (timed out)** to **5 minutes 55 seconds** (Snapshot `9eb0e024`).
  3. Optimized [restore-check.sh](deploy/backup/restore-check.sh) to perform selective database extraction drills: verified all snapshots clean and parsed table DDL in under four minutes.
  4. Documented the full operational procedure in the [Disaster Recovery Runbook](docs/security/disaster-recovery-drill.md).

### 2. Tenant Secret Envelope Encryption (AES-256-GCM)
* **The Challenge:** Multi-tenant applications require database URLs, API tokens, and private keys. Storing secrets as plaintext in relational databases exposes customer credentials during accidental database dumps, replication logs, or snapshot leakage.
* **The Solution ([SecretVaultService](apps/api/src/common/crypto/secret-vault.service.ts)):**
  - Designed an authenticated envelope encryption schema:
    ```json
    {
      "__encrypted": true,
      "version": 1,
      "iv": "3a7b...",
      "tag": "e91c...",
      "ciphertext": "04fa..."
    }
    ```
  - Legacy migration: unencrypted records stay readable and are encrypted the next time they are saved, so no maintenance window is needed.
  - Implemented 16-byte authentication tags to instantly reject database-level tampering or ciphertext corruption.

### 3. Container Sandbox Containment & Docker Socket Isolation
* **Attack Vector:** Standard PaaS architectures mount `/var/run/docker.sock` directly into edge routers or control plane containers, allowing any container escape or SSRF to gain instant root control over the host.
* **Defense-in-Depth Implementation:**
  - **Socket Proxying:** Neither the API nor Traefik touches the host Docker socket. Communication traverses `tecnativa/docker-socket-proxy` configured with `EXEC=0`, `BUILD=0`, `POST=0`, preventing container execution or image build exploits.
  - **Immutable Containers ([docker-compose.prod.yml](docker-compose.prod.yml)):** The API, dashboard, agent and Traefik run with `read_only: true`, `cap_drop: [ALL]` (Traefik keeps only `NET_BIND_SERVICE`), `no-new-privileges` and `tmpfs` scratch space. The two Docker socket proxies drop all capabilities but need a writable root for their generated config. Tenant workloads drop all capabilities.
  - **Path Traversal Shield:** The Go runtime agent strictly validates all build paths with `deploymentDirectory()` ([workload.go:69](apps/agent-go/workload.go#L69)) using `filepath.Clean` and prefix assertions, verified by automated unit tests.

### 4. Supply Chain Security & Immutable Image Attestation
* **Threat:** Malicious dependencies or unauthorized container images pushed to production registries.
* **Pipeline Controls ([publish-images.yml](.github/workflows/publish-images.yml)):**
  - **Keyless Signing:** Images published to GHCR are signed using **Cosign** (Sigstore OIDC) anchored to GitHub Actions workflow identity.
  - **SBOM Generation:** Anchore **Syft** generates and pushes standard SPDX Software Bills of Materials for each container.
  - **Blocking CI Gates ([ci.yml](.github/workflows/ci.yml)):** Gitleaks secret detection, Trivy vulnerability scanning (`exit-code: 1`), and Checkov IaC scanning block releases on critical flaws.
  - **Least Privilege Deployment:** Deployment runners authenticate over SSH with restricted sudoers access locked down to a single script: `sudo /srv/aetherhost/control/deploy/deploy-production.sh`.

### 5. Infrastructure as Code (Terraform) & Kubernetes GitOps
* **Infrastructure as Code ([terraform/](terraform/)):** Terraform defines the Cloudflare DNS records and GitHub branch protection (pull request plus green CI on `main`, enforced for administrators). It passes `terraform validate` and Checkov in CI; importing the live resources and the first apply are pending.
* **Scaling Roadmap, not deployed ([deploy/KUBERNETES.md](deploy/KUBERNETES.md)):** Documented Architectural Decision Record (ADR 004) detailing the operational transition from single-node hardened Compose to distributed Flux v2 GitOps and Helm charts ([deploy/helm/aether-platform](deploy/helm/aether-platform)) targeting AWS EKS / k3s with restricted Pod Security Standards.

---

## 📊 Compliance & Governance Alignment

| Trust Services Criteria | Control Description | Technical Evidence |
| :--- | :--- | :--- |
| **CC6.1 (Logical Access)** | Tenant-scoped database queries, Clerk JWT authentication | [ApplicationsService](apps/api/src/applications/applications.service.ts) |
| **CC6.6 (Boundary Protection)** | Read-only socket proxy for Traefik, internal-only provisioning proxy, UFW firewall | [docker-compose.prod.yml](docker-compose.prod.yml) |
| **CC6.7 (Data Protection)** | AES-256-GCM envelope encryption for secrets at rest | [SecretVaultService](apps/api/src/common/crypto/secret-vault.service.ts) |
| **CC7.1 (Threat Detection)** | Gitleaks, Trivy, Checkov security scanners in CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| **CC7.2 (Incident Management)** | Documented root-cause postmortems with action items | [docs/incidents/](docs/incidents/2026-11-07-platform-overwrite.md) |
| **A1.2 (Disaster Recovery)** | Offsite CDC deduplicated Restic snapshots, daily restore drill | [docs/security/disaster-recovery-drill.md](docs/security/disaster-recovery-drill.md) |

---

## 🚀 Live Demonstration Script

To verify all security controls in real-time, run the automated verification suite:

```bash
bash scripts/demo-security-controls.sh
```

This script executes live validation of:
1. AES-256-GCM secret envelope encryption & tampering detection.
2. Path traversal rejection in the Go runtime agent.
3. Container security postures (`read_only` and capability drops).
4. Helm chart linting and template rendering.
5. Gitleaks and Trivy supply chain scan policies.
6. The non-destructive disaster recovery restore drill.
