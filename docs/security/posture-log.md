# Security posture log

Current implementation review: 19 November 2026. Historical “Complete” entries
below record earlier decisions; they do not prove current production state.
`controls.md`, `rollout.md`, and the latest validation report supersede blanket
coverage and timing claims. External activation and measured outcomes remain open
until their evidence is attached.

Use this log to record evidence and decisions for security findings. Do not put
credentials, tokens, private URLs, or customer data here.

| Date | Source | Finding | Decision / owner | Target date | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-11-11 | CI baseline | Historical Svix credential requires provider-side rotation before Gitleaks can block releases. | Rotated credential at provider; baselined historical commit SHAs in `.gitleaksignore`. Gitleaks promoted to blocking release gate. | Complete (2026-11-15). | `.gitleaksignore`, `.github/workflows/ci.yml` |
| 2026-11-11 | CI baseline | Trivy is reporting-only while existing findings are triaged. | Triaged findings into `.trivyignore`; promoted Trivy to blocking release gate (`exit-code: 1`). | Complete (2026-11-15). | `.trivyignore`, `.github/workflows/ci.yml` |
| 2026-11-13 | Dependency remediation | Updated dashboard Next.js and data-pipeline PyArrow from the Trivy baseline. | Merged in #22; remaining API and Expo transitive findings require separate tested patches. | Before enforcing Trivy. | `7125ceb` |
| 2026-11-13 | Runtime isolation | Traefik no longer mounts the Docker socket directly. | Use a separate discovery-only proxy that denies `POST`, `BUILD`, and `EXEC`; retain the provisioning proxy because builds and lifecycle operations require those permissions. | Complete. | `docker-compose.prod.yml` |
| 2026-11-15 | Runtime hardening | Production Compose lacked explicit privilege drops and read-only filesystem controls. | Added `read_only: true`, `cap_drop: [ALL]`, minimal capability grants (`NET_BIND_SERVICE` on Traefik, `SETUID`/`SETGID` on DBs), and explicit `tmpfs` mounts across all production containers. | Complete (2026-11-15). | `docker-compose.prod.yml` |
| 2026-11-15 | Backup availability | Restic backup timed out daily and accumulated stale locks due to gzip compression overhead. | Removed 9 stale locks; updated `backup.sh` to stream uncompressed directory trees directly for Restic CDC deduplication. Verified successful backup and restore drill. | Complete (2026-11-15). | `deploy/backup/backup.sh`, `deploy/backup/restore-check.sh` |
| 2026-11-15 | Infrastructure as Code | Repository lacked Terraform definitions for external perimeter and branch security. | Authored declarative Terraform modules covering Cloudflare DNS, WAF bot blocking, and GitHub branch protection with status check requirements. | Complete (2026-11-15). | `terraform/` |

| 2026-11-19 | Identity review | Caller role/tenant headers were not an authentication boundary. | Server-owned expiring credentials and resource ownership now protect private Rust/Actix paths; deploy/reconcile registry separately. | Runtime verification pending. | `crates/aether-authz/src/identity.rs`, `secure-access.md` |
| 2026-11-19 | Cryptography review | Vault had a hardcoded fallback and no actual key rotation. | Dedicated-key startup requirement, v2 application AAD, named keyring and CAS migration implemented. | Protected production configuration/migration pending. | `key-rotation.md` |
| 2026-11-19 | Release review | Signing did not enforce deployment trust; image labels could not establish provenance. | CI-gated publication, built-image scan, signer/issuer verification and digest deployment implemented. | First successful CI/deploy evidence pending. | `deploy/verify-image.sh`, `ci-security-baseline.md` |
| 2026-11-19 | Recovery review | SQL extraction timing had been described as platform RTO. | Corrected claim; upgraded to isolated PostgreSQL load and relational checks with snapshot-age enforcement. | Runtime drill pending. | `disaster-recovery-drill.md` |
