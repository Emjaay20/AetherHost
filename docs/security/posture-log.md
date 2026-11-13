# Security posture log

Use this log to record evidence and decisions for security findings. Do not put
credentials, tokens, private URLs, or customer data here.

| Date | Source | Finding | Decision / owner | Target date | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-11-11 | CI baseline | Historical Svix credential requires provider-side rotation before Gitleaks can block releases. | Pending credential owner action. | Before enforcing Gitleaks. | `docs/security/ci-security-baseline.md` |
| 2026-11-11 | CI baseline | Trivy is reporting-only while existing findings are triaged. | Pending first baseline scan and finding owners. | Before enforcing Trivy. | `docs/security/ci-security-baseline.md` |
| 2026-11-13 | Dependency remediation | Updated dashboard Next.js and data-pipeline PyArrow from the Trivy baseline. | Merged in #22; remaining API and Expo transitive findings require separate tested patches. | Before enforcing Trivy. | `7125ceb` |
| 2026-11-13 | Runtime isolation | Traefik no longer mounts the Docker socket directly. | Use a separate discovery-only proxy that denies `POST`, `BUILD`, and `EXEC`; retain the provisioning proxy because builds and lifecycle operations require those permissions. | Complete. | `docker-compose.prod.yml` |
