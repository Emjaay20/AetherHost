# Security Policy & Architecture

AetherHost takes security and multi-tenant isolation seriously. This document outlines our security policies, architecture principles, vulnerability reporting process, and cryptographic controls.

---

## 1. Security Architecture & Threat Model

AetherHost operates on a **zero-trust and least-privilege** model designed to isolate untrusted customer applications from the underlying host and orchestrator.

### Core Security Controls
* **Tenant Secret Envelope Encryption:** Application environment variables and credentials are encrypted at rest using **AES-256-GCM** with unique 12-byte initialization vectors (IVs) and 16-byte authentication tags. See [SecretVaultService](apps/api/src/common/crypto/secret-vault.service.ts).
* **Zero-Trust Docker Socket Proxy:** Neither user workloads nor the public edge proxy have direct access to `/var/run/docker.sock`. All container orchestration is mediated through a restricted socket proxy (`tecnativa/docker-socket-proxy`) with `EXEC=0`, `BUILD=0`, and `POST=0`.
* **Container Hardening:** The API, dashboard, agent and Traefik run with `read_only: true`, `cap_drop: [ALL]` (Traefik keeps only `NET_BIND_SERVICE`), `no-new-privileges` and `tmpfs` scratch space. The two Docker socket proxies drop all capabilities but need a writable root for their generated config. Tenant workloads drop all capabilities.
* **Continuous Disaster Recovery Verification:** Automated daily non-destructive restore drills verify backup cryptographic integrity and extract database snapshots in under four minutes without affecting production. See [Disaster Recovery Runbook](docs/security/disaster-recovery-drill.md).
* **Cryptographic Supply Chain Security:** All container images are built in GitHub Actions with pinned commit dependencies, published to GHCR, signed with keyless **Cosign** (Sigstore), and accompanied by **Syft** Software Bills of Materials (SBOMs).
* **Infrastructure as Code (IaC):** DNS records and GitHub branch protection are defined in Terraform, validated and scanned by Checkov in CI; importing the live resources and the first apply are pending. See [terraform/](terraform/).

Detailed STRIDE analysis and trust boundary mappings are available in our [STRIDE Threat Model](docs/security/threat-model.md).

---

## 2. Compliance & SOC 2 Trust Services Criteria

Our operational and technical controls are mapped directly to AICPA SOC 2 Type II criteria:
* **Common Criteria (CC6.1–CC6.8):** Logical and physical access controls, envelope encryption, credential redaction, and perimeter defense.
* **System Operations (CC7.1–CC7.4):** Vulnerability management, incident management postmortems, and systemd failure alerting.
* **Availability (A1.2–A1.4):** Restic CDC deduplicated backups and automated daily restore drills.

Review the complete matrix in [SOC 2 Controls Mapping](docs/security/controls.md).

---

## 3. Reporting a Vulnerability

We appreciate the responsible disclosure of security vulnerabilities by security researchers and the community.

### Vulnerability Scope
* AetherHost API, Dashboard, and Agent runtime components.
* Traefik edge reverse proxy and Docker socket isolation boundaries.
* Data isolation, tenant boundaries, and authentication bypasses.
* Remote code execution, privilege escalation, or path traversal vectors.

### Out of Scope
* Distributed denial of service (DDoS) against edge infrastructure.
* Social engineering or phishing of platform operators.
* Third-party hosted services (Clerk, Stripe, Cloudflare) unless direct misconfiguration is present.

### How to Report
1. Email your findings to **security@aetherhost.app** (or open a private GitHub Security Advisory).
2. Include detailed reproduction steps, proof of concept (PoC), and potential impact.
3. Please allow up to 48 hours for an initial response from our security team.
4. We request that you refrain from publicly disclosing the issue until our team has triaged and deployed a fix.
