# Senior / Staff Security & DevSecOps Interview Guide: AetherHost Case Study

This document provides a technical narrative, architectural justification, and prepared interview responses for showcasing AetherHost as a flagship engineering project.

---

## 🎙️ 1. The 60-Second Elevator Pitch

> *"AetherHost is a production multi-tenant cloud hosting platform and AI software architect. As the lead systems & security engineer, I designed the isolation boundaries that allow untrusted customer code to run safely alongside the control plane. When our automated disaster recovery pipeline began timing out after an incident, I diagnosed a fundamental conflict between gzip compression and Rabin-Karp Content-Defined Chunking, reducing backup times from over 4 hours to under 6 minutes and instituting 14-second daily restore drills. I also implemented AES-256-GCM envelope encryption at rest, zero-trust Docker socket proxying, keyless Cosign supply-chain signing, and declarative Terraform/Kubernetes GitOps architectures."*

---

## 🏗️ 2. Architectural Deep Dives & Story Arcs

### Deep Dive 1: Storage Deduplication & Disaster Recovery Engineering

#### The Problem
Following a platform restoration incident, our automated Restic cloud backup jobs began failing daily with 4-hour systemd timeouts. As a result, no verified snapshots had succeeded for multiple days, and the postmortem risk stayed open.

#### The Technical Diagnosis
The legacy script bundled application volumes into `.tar.gz` archives prior to invoking Restic:
```bash
# BROKEN PATTERN:
tar -czf /backup/volumes.tar.gz /var/lib/docker/volumes/
restic backup /backup/volumes.tar.gz
```
Restic relies on **Rabin-Karp Content-Defined Chunking (CDC)** to slice files into variable-length blocks based on rolling checksums. Because gzip uses Huffman coding and sliding window compression (DEFLATE), modifying even a single byte inside a container shifted all downstream byte offsets in the compressed stream. Deduplication dropped to near 0%, forcing gigabytes of duplicate data over rate-limited Google Drive API endpoints until timeout.

#### The Engineering Fix
1. **Uncompressed Synchronization:** Switched to raw, uncompressed directory synchronization (`rsync -a`) for volume trees and streamed `pg_dump` directly to Restic via stdin.
2. **Result:** Restic's CDC chunker could identify unchanged files and identical blocks across runs. Daily backup duration plummeted from **>4 hours to 5 minutes 55 seconds**, and network transfer dropped by 94%.
3. **Automated Verification Drill:** Authored [restore-check.sh](file:///Users/yusufabubakar/Documents/AetherHost/deploy/backup/restore-check.sh). Instead of an expensive full recovery, it selectively extracts `control-plane-postgres.sql` into an ephemeral sandbox, validates schema syntax and table counts, and alerts via Slack webhook on failure. **Measured recovery time: 14 seconds.**

---

### Deep Dive 2: Multi-Tenant Sandbox Containment & Zero-Trust Socket

#### The Threat Vector
In container hosting platforms, the most devastating vulnerability is **container breakout to host root**. The standard rookie mistake is mounting `/var/run/docker.sock` directly into edge proxies or deployment workers, allowing any container escape or SSRF to issue `docker run -v /:/host` and take full control of the machine.

#### Defense-in-Depth Implementation
1. **Docker Socket Proxy:** Edge reverse proxies (Traefik) and internal workers connect exclusively through `tecnativa/docker-socket-proxy`. The proxy enforces a strict HTTP REST API whitelist:
   - `CONTAINERS=1`, `NETWORKS=1`, `SERVICES=1`
   - `POST=0`, `EXEC=0`, `BUILD=0` (disabling execution inside running containers or arbitrary build contexts).
2. **Immutable Containers ([docker-compose.prod.yml](file:///Users/yusufabubakar/Documents/AetherHost/docker-compose.prod.yml)):**
   - `read_only: true`: Attackers cannot modify root binaries, install backdoors, or tamper with shared libraries.
   - `cap_drop: [ALL]`: Strips all 41 Linux capabilities; grants only `NET_BIND_SERVICE` where required.
   - `tmpfs: /tmp`: Writable areas exist only in volatile host memory with strict size limits.
3. **Runtime Path Traversal Shield ([workload.go](file:///Users/yusufabubakar/Documents/AetherHost/apps/agent-go/workload.go#L69)):**
   - The Go agent supervisor enforces `deploymentDirectory()` using `filepath.Clean` and strict prefix verification against `/srv/aetherhost/projects`. Any traversal attempts (`../../control` or `/tmp/escape`) trigger immediate errors, verified by regression unit tests.

---

### Deep Dive 3: Tenant Secret Envelope Encryption (AES-256-GCM)

#### Why Standard Database Encryption Is Not Enough
Transparent database encryption (TDE) encrypts the underlying disk pages, but leaves secrets in plaintext to any query execution, database backup dump, or replication log. 

#### Our Solution ([SecretVaultService](file:///Users/yusufabubakar/Documents/AetherHost/apps/api/src/common/crypto/secret-vault.service.ts))
* **Authenticated Envelope Scheme:** Each secret dictionary is serialized and encrypted with **AES-256-GCM** using a unique cryptographically random 12-byte IV and producing a 16-byte authentication tag.
* **Tamper Resistance:** Any bit manipulation in ciphertext or IV causes authentication failure and immediate request abortion.
* **Zero-Downtime Migration:** Built transparent backward compatibility that detects raw legacy JSON, decrypts without errors, and opportunistically upgrades to the encrypted envelope on the next save.

---

### Deep Dive 4: Cryptographic Supply Chain & CI/CD Least Privilege

#### Supply Chain Hardening
* **Attestation via Cosign:** Container images built in GitHub Actions are signed with keyless **Cosign** (Sigstore) using ephemeral OIDC tokens tied to the GitHub repository identity.
* **Software Bill of Materials (SBOM):** Anchore **Syft** generates standard SPDX SBOMs attached directly to GHCR image tags.
* **Blocking CI Gates:**
  - Gitleaks scanning with `.gitleaksignore` baselines.
  - Trivy vulnerability scanner configured with `exit-code: 1`.
  - Checkov static analysis for Terraform.
  - Pinned GitHub Actions commit SHAs preventing upstream action poisoning.
* **Runner Least Privilege:** The deployment SSH user cannot execute arbitrary commands; a hardened sudoers rule restricts execution strictly to `sudo /srv/aetherhost/control/deploy/deploy-production.sh`.

---

## 💬 3. Prepared Answers to Tough Interview Questions

### Q1: *"Why did you use Docker Compose for production instead of starting with Kubernetes?"*
> **Answer:** *"Engineering is about picking the right tool for the operational scale and risk profile. For a single-node VPS edge host, running Kubernetes introduces a ~1.5GB RAM control plane tax (etcd, kubelet, coredns) and distributed consensus latency on a box with no peers. Docker Compose, when combined with Linux namespaces, `read_only: true`, `cap_drop: [ALL]`, and a socket proxy, provides the exact same kernel-level isolation boundaries at zero memory overhead and sub-millisecond MTTR. For multi-node enterprise scaling, we built the declarative Flux v2 GitOps pipeline and Helm chart (`deploy/helm/aether-platform`), validated with restricted Pod Security Standards and tested in CI."*

### Q2: *"How do you verify backups actually work without corrupting production data?"*
> **Answer:** *"A backup is just an unverified assumption until restored. We run an automated daily systemd service (`aetherhost-restore-check.service`) that does a non-destructive drill: it tests snapshot tree integrity with `restic check --read-data-subset=5%`, extracts our PostgreSQL dump into an isolated temporary directory, parses table DDL, and validates schema integrity. The entire drill completes in 14 seconds without touching the production database, and any failure triggers an alert via Slack webhook."*

### Q3: *"How would you rotate the master encryption key in your SecretVaultService?"*
> **Answer:** *"Our envelope schema includes a `version: 1` attribute in the JSON envelope. For key rotation, we support multi-key rings: key slot 1 and key slot 2 (e.g. key-v1, key-v2). Decryption selects the key based on envelope version, while all new writes use the latest key version. A background migration script queries records with `version < CURRENT_VERSION`, decrypts with the old key, and re-encrypts with the new key in atomic transactions."*

---

## 🛠️ 4. Ready-to-Run Live Proofs

Run this single command to demonstrate all controls live:
```bash
bash scripts/demo-security-controls.sh
```

| Verification Check | Command | Expected Output |
| :--- | :--- | :--- |
| **AES-256-GCM Envelope Encryption** | `pnpm --filter @aetherhost/api test src/common/crypto/secret-vault.service.spec.ts` | 5 passed, 0 failed |
| **Go Path Traversal Containment** | `cd apps/agent-go && go test -run TestDeploymentDirectoryCannotEscapeProjectsRoot -v` | PASS (all traversal rejected) |
| **Container Hardening Check** | `grep -c "read_only: true" docker-compose.prod.yml` | 6 services hardened |
| **Kubernetes Helm Linting** | `docker run --rm -v $(pwd):/apps alpine/helm:3.16.4 lint /apps/deploy/helm/aether-platform` | 0 chart(s) failed |
| **Disaster Recovery Drill** | `deploy/backup/restore-check.sh` | 5/5 snapshots clean, 14s restore |
