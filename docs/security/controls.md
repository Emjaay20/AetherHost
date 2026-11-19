# Internal security control mapping

Assessment: repository implementation review, 19 November 2026. These are working
technical categories, not an auditor-approved SOC 2 mapping or compliance claim.
Code presence, passing tests, applied configuration and operating effectiveness
are separate evidence levels. No blanket coverage percentage is claimed.

| Area | Repository implementation | Evidence still needed |
| --- | --- | --- |
| Identity and tenant access | Server-owned expiring service credentials; authoritative resource ownership; RBAC/ABAC checks; Clerk console authentication | Deploy registry, reconcile ownership from control plane, verify real revocation and cross-tenant denial |
| Secret confidentiality | Dedicated AES-GCM keyring, application AAD, malformed-envelope rejection, CAS migration script | Protected key provisioning, successful migration, retained-backup key recovery, KMS integration if required |
| Runtime boundaries | Scoped discovery proxy; Compose security profiles; Kubernetes non-root, seccomp, digest requirement and network policy | Effective host privileges, CNI enforcement, observed container configuration, tested network denial |
| Change and release integrity | Tests and scans before publication; full Action SHA pins; Cosign verification; immutable deploy digests | Successful pipeline and signature records, branch-protection API export, production environment and host fingerprint settings |
| Vulnerability lifecycle | Blocking source/image scans; expiring exception register; host fleet scanner and timer | Finding-specific triage, patch verification, installed scanner, operational reports and review history |
| Data handling | Inventory, deployment-log redaction, age-based retention command | Configured retention schedule, DB role restrictions, deletion/access review evidence |
| Auditability | Structured authorization events and bounded diagnostic buffers; database audit records | Durable collector, tamper resistance, least-privilege access and retention enforcement; DB records are not inherently immutable |
| Recovery | Off-host backup scripts; sampled repository check; isolated PostgreSQL restore and relational queries | Current verified backups, actual drill output, full application/workload recovery and measured RTO/RPO |
| Incident handling | Incident records and synthetic compromised-identity exercise | Executed exercise timeline, observed detection/revocation/recovery, corrective-action closure |
| Cloud baseline | Cloudflare/GitHub Terraform and optional AWS S3/KMS/CloudTrail/OIDC lab | Terraform validation/plan/apply evidence, protected remote state, drift review, AWS runtime findings |

Production activation checklist: [security rollout](rollout.md).
