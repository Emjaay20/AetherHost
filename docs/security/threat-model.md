# AetherHost STRIDE Threat Model

**Classification:** Internal Security Architecture & Audit  
**Target Architecture:** Multi-Tenant Application Hosting Platform (Edge, Control Plane, Tenant Workloads)  
**Standard:** Microsoft Threat Modeling Process (STRIDE Methodology)  
**Last Updated:** 2026-11-15  

---

## 1. System Overview & Trust Boundaries

AetherHost orchestrates, deploys, and observes multi-tenant customer applications across isolated container runtimes. The architecture contains four primary trust domains:

```
+-----------------------------------------------------------------------------------+
| [Trust Domain 0: Untrusted Public Internet]                                      |
| Customers / API Users / Webhook Sources (GitHub, Stripe)                          |
+-----------------------------------------------------------------------------------+
                                         │ HTTPS / TLS 1.3
                                         ▼
+-----------------------------------------------------------------------------------+
| [Trust Domain 1: Ingress & Edge Gateway]                                          |
| Cloudflare WAF ──► Traefik Reverse Proxy (read_only, cap_drop: ALL)              |
+-----------------------------------------------------------------------------------+
                                         │ Mutual Internal Bridge
                                         ▼
+-----------------------------------------------------------------------------------+
| [Trust Domain 2: Core Platform Control Plane]                                     |
|  - NestJS API (SecretVaultService AES-256-GCM, AuditLogger, LogRedaction)         |
|  - PostgreSQL (Encrypted envVars, AuditLog tables) & Redis (Rate Limiter)         |
|  - Go Agent (Isolated workload supervisor)                                        |
|  - Docker Socket Proxy (RO access: EXEC=0, BUILD=0, POST=0)                       |
+-----------------------------------------------------------------------------------+
                                         │ Controlled Provisioning
                                         ▼
+-----------------------------------------------------------------------------------+
| [Trust Domain 3: Tenant Runtime Execution Sandboxes]                              |
| Tenant Containers (read_only, cap_drop: ALL, cgroups v2, no host socket mount)    |
+-----------------------------------------------------------------------------------+
```

### Trust Boundary Definitions
1. **TB-1 (Internet to Edge):** Public unauthenticated network boundary.
2. **TB-2 (Edge to Control Plane):** Authenticated ingress. Traefik terminates TLS and proxies traffic to the API service.
3. **TB-3 (Control Plane to Docker Engine):** Highly privileged boundary mediated exclusively by the Docker Socket Proxy (blocking container execution/escape primitives).
4. **TB-4 (Control Plane to Tenant Sandboxes):** Untrusted tenant code execution isolated by container namespaces, cgroups, and restricted capability envelopes.
5. **TB-5 (Data Persistence & Backups):** Control plane database and volumes synchronized offsite via encrypted Restic CDC snapshots.

---

## 2. Threat Analysis by STRIDE Category

### S - Spoofing (Identity & Authenticity)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | Tenant impersonation on API endpoints | Forged JWT or modified tenant ID parameter in REST calls | Unauthorized access to other tenant applications | **Mitigated:** Clerk JWT validation in NestJS auth guards; tenant ownership scoping enforced at database layer on every Prisma query (`where: { id, userId }`). |
| **S-02** | Agent control command spoofing | Malicious actor injecting commands into agent Unix socket/HTTP | Rogue container provisioning | **Mitigated:** `AGENT_SECRET_KEY` shared-secret HMAC header validation required on all agent IPC calls. |
| **S-03** | Webhook request spoofing | Spoofed GitHub/Svix webhook triggering fake redeploys | Malicious redeployment or denial of service | **Mitigated:** Cryptographic Svix signature verification (`svix-id`, `svix-timestamp`, `svix-signature`) using securely rotated webhook secrets. |
| **S-04** | Container image spoofing | Tampered or malicious container image deployed to production | Supply chain code execution on host | **Mitigated:** GitHub Actions builds images, pushes to GHCR with commit SHA tags, signs digests with keyless **Cosign** (Sigstore), and attaches Syft SBOMs. |

---

### T - Tampering (Integrity & State)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | Directory path traversal during build | Malicious `target` or app name e.g., `../../etc/shadow` in deployment request | Overwrite host files or platform binaries | **Mitigated:** `deploymentDirectory()` in [workload.go](file:///Users/yusufabubakar/Documents/AetherHost/apps/agent-go/workload.go#L69) sanitizes paths with `filepath.Clean` and asserts `strings.HasPrefix(target, basePath)`. Regression test verified in `main_test.go:32`. |
| **T-02** | In-flight container modification | Attacker modifying running container binaries or libraries | Persistent backdoor in container | **Mitigated:** Containers configured with `read_only: true` in [docker-compose.prod.yml](file:///Users/yusufabubakar/Documents/AetherHost/docker-compose.prod.yml). Writable areas restricted to explicit `tmpfs` mounts (`/tmp`). |
| **T-03** | Database secret tampering | Direct database access or SQL manipulation altering secrets | Decryption failures or malicious credential injection | **Mitigated:** `SecretVaultService` employs **AES-256-GCM** with a 16-byte authentication tag. Any tampering with ciphertext or IV causes authentication failure and immediate rejection. |
| **T-04** | Backup snapshot corruption | Ransomware or accidental deletion of backup repository | Inability to recover from disaster | **Mitigated:** Restic snapshots are append-only and cryptographically hashed with SHA-256; daily automated non-destructive drills ([restore-check.sh](file:///Users/yusufabubakar/Documents/AetherHost/deploy/backup/restore-check.sh)) verify integrity and database loadability. |

---

### R - Repudiation (Auditability & Accountability)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | Unattributed administrative modifications | Operator or attacker alters tenant quotas or terminates apps | Inability to attribute incidents or perform forensics | **Mitigated:** `AuditLog` service records every administrative action (actor ID, action, resource, timestamp, and IP address) in PostgreSQL. |
| **R-02** | Untracked deployment execution | Code deployed to production with no corresponding git commit | Shadow deployments or untracked releases | **Mitigated:** Deployments are triggered solely via Git commit SHAs, attested with Cosign signatures, and logged via CI/CD audit trails. |

---

### I - Information Disclosure (Confidentiality & Privacy)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **I-01** | Plaintext secret exposure in database | Database breach, unencrypted backup, or SQL dump leak | Exposure of tenant API keys, database URLs, third-party tokens | **Mitigated:** Envelope encryption via `SecretVaultService` (AES-256-GCM). Secrets are stored as encrypted JSON envelopes `{ __encrypted: true, iv, tag, ciphertext }`. Database dumps contain zero plaintext tenant secrets. |
| **I-02** | Sensitive credential leak in logs | Stack trace or debug log dumping environment variables | Leakage to log aggregators or terminal outputs | **Mitigated:** Centralized `log-redaction.ts` redacts JWTs, bearer tokens, API keys, and connection strings before serialization. |
| **I-03** | Host directory inspection by agent | Go Agent reading platform control configs or private keys | Compromise of platform control plane | **Mitigated:** Control plane repository mounted strictly `ro` (`/srv/aetherhost/control:ro`). The agent can write only to the tenant project build directory (`/srv/aetherhost/projects`). |
| **I-04** | Secrets committed to source control | Developer commits credentials to repository | Public or contractor exposure | **Mitigated:** Gitleaks enforced as a blocking gate in CI (`.github/workflows/ci.yml`), baselined with `.gitleaksignore`. |

---

### D - Denial of Service (Availability & Resilience)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | Tenant CPU / RAM resource exhaustion | Fork bomb or memory leak in customer container | Host starvation affecting all tenants | **Mitigated:** Docker compose resource constraints and Kubernetes HPA/PDB specs. Containers cannot exhaust host memory. |
| **D-02** | Backup pipeline stall / timeout | Uncompressed tar archives overwhelming Restic CDC deduplication | Backup locks, 4-hour timeouts, failed disaster recovery | **Mitigated:** Switched backup pipeline to direct directory sync and standard streams; Content-Defined Chunking deduplication restored; backup execution reduced from >4 hours to **5m 55s**. |
| **D-03** | Edge volumetric HTTP flooding | Layer 7 DDoS attack on router endpoints | Service unavailability | **Mitigated:** Cloudflare WAF rate limiting rules (`terraform/firewall.tf`) combined with Traefik rate-limiting middleware. |

---

### E - Elevation of Privilege (Access Control & Isolation)

| Threat ID | Threat Description | Attack Vector | Impact | Mitigations & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **E-01** | Container breakout via Docker socket | Compromised container accessing `/var/run/docker.sock` | Full host root compromise | **Mitigated:** Zero direct Docker socket mounts. Traefik and orchestration agents connect via `tecnativa/docker-socket-proxy` with `CONTAINERS=1`, `NETWORKS=1`, `POST=0`, `EXEC=0`, and `BUILD=0`. |
| **E-02** | Linux kernel privilege escalation from container | Vulnerability in kernel exploited from inside container | Container escape to host root | **Mitigated:** `cap_drop: [ALL]` applied to all containers. Only explicit minimal capabilities (`NET_BIND_SERVICE`) granted where essential. |
| **E-03** | CI deploy pipeline privilege escalation | Attacker with repository access executing arbitrary root commands | Complete takeover of production host | **Mitigated:** Deploy runner restricted by sudoers file to execute exactly one fixed script path (`sudo /srv/aetherhost/control/deploy/deploy-production.sh`) without interactive shell or arguments. |

---

## 3. Residual Risk & Ongoing Hardening

| Risk | Residual Level | Mitigating Factor | Future Roadmap |
| :--- | :--- | :--- | :--- |
| Single-Node Host Failure | Low | Automated daily Restic backups to remote storage; restore check verified in 14s. | Multi-region Kubernetes cluster deployment via Flux v2 GitOps. |
| Kernel 0-day Container Escape | Very Low | `cap_drop: ALL`, read-only filesystems, and unprivileged user mappings. | Evaluation of gVisor (`runsc`) or Kata Containers for untrusted user code. |
| KMS Key Rotation | Low | Master encryption key stored in environment variable on host. | Integration with AWS KMS / HashiCorp Vault for automated key rotation. |
