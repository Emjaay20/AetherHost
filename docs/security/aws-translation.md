# From self-managed infrastructure to AWS

This is an engineering translation, not an account inventory. AetherHost runs on
a Contabo VPS with Cloudflare; repository configuration is not, by itself, proof
that a control is active or effective. Evidence levels distinguish designed,
implemented, tested, and operating. AWS entries are tested designs (offline) only
where the linked mock-provider tests and Checkov actually pass; otherwise they are
design only. No AWS resources are claimed to be deployed.

| Objective | Contabo / repository implementation | Evidence level and source | AWS equivalent | AWS implementation | Responsibility shift or new risk |
| --- | --- | --- | --- | --- | --- |
| Network perimeter | [Cloudflare firewall](../../terraform/firewall.tf), [DNS](../../terraform/dns.tf) | Designed; [rollout evidence](../validation/2026-11-20-security-rollout-evidence.md) distinguishes unapplied Terraform | Security groups, NACLs, WAF | Design only | IAM and security-group rule sprawl; AWS handles physical network infrastructure. |
| Deploy least privilege | [sudoers](../../deploy/sudoers/aetherhost-deploy), [installer](../../deploy/install-ci-deploy-access.sh) | Implemented; [rollout](rollout.md) tracks activation | GitHub OIDC role, SSM Session Manager | [OIDC role](../../terraform/aws-security-lab/main.tf), tested design (offline) | Trust subject and session policy configuration remain customer responsibilities. |
| Secrets at rest | [vault](../../apps/api/src/common/crypto/secret-vault.service.ts), [key rotation](key-rotation.md) | Implemented/tested; [rollout evidence](../validation/2026-11-20-security-rollout-evidence.md) records migration gaps | KMS and Secrets Manager | KMS key in [lab](../../terraform/aws-security-lab/main.tf), tested design (offline); Secrets Manager design only | AWS manages KMS hardware; key policies, access and recovery remain ours. |
| Audit logging | [auditability](controls.md) | Implemented; durable collection remains open | CloudTrail and CloudWatch Logs | CloudTrail in [lab](../../terraform/aws-security-lab/main.tf), tested design (offline); CloudWatch design only | Misconfigured trails, retention and cross-account access remain risks. |
| Vulnerability management | [CI scans](../../.github/workflows/ci.yml), [fleet timer](../../deploy/systemd/aetherhost-fleet-scan.timer), [exceptions](vulnerability-exceptions.json) | Implemented; operating history not established in [controls](controls.md) | ECR scanning, Inspector, Security Hub | Design only | Enable coverage, triage findings and track remediation despite managed scanning. |
| Image integrity | [image workflow](../../.github/workflows/publish-images.yml), [verification](../../deploy/verify-image.sh) | Tested and signed VPS release recorded in [validation](../validation/2026-11-20-security-rollout-evidence.md) | ECR and AWS Signer or Kyverno verification | Design only | Registry access and signer identity remain security boundaries. |
| Container hardening | [Compose](../../docker-compose.prod.yml) | Tested locally; [validation](../validation/2026-11-20-security-rollout-evidence.md) details scope | ECS read-only filesystem, EKS pod security | Design only | ECS/EKS configuration and workload identity are customer-managed. |
| Backup and recovery | [backup](../../deploy/backup/backup.sh), [restore check](../../deploy/backup/restore-check.sh), [drill](disaster-recovery-drill.md) | Implemented; full recovery proof remains open in [controls](controls.md) | AWS Backup, S3 versioning and Object Lock | Versioning in [lab](../../terraform/aws-security-lab/main.tf), tested design (offline); backup and Object Lock design only | Immutability, restore testing, deletion protection and cost controls must be configured. |
| Database least privilege | [role definitions](../../deploy/database/access-roles.sql) | Implemented; memberships and denials still require tests per [inventory](data-inventory.md) | RDS, IAM DB authentication and separated roles | Design only | RDS patches managed infrastructure; SQL grants, credentials and queries remain ours. |
| Data handling | [inventory](data-inventory.md), [redaction](../../apps/api/src/applications/log-redaction.ts), [retention](data-inventory.md#enforced-lifecycle-tooling) | Implemented; scheduled retention remains open | Macie, S3 lifecycle and CloudWatch log retention | Design only | Classification coverage, log exposure and deletion schedules require verification. |
| Detection and response | [incidents](../incidents/2026-11-07-platform-overwrite.md), [exercise](incident-exercise.md), [alert unit](../../deploy/systemd/aetherhost-operation-alert@.service) | Incident documented; exercise execution and alert effectiveness remain open | GuardDuty, EventBridge and SNS | Optional GuardDuty in [lab](../../terraform/aws-security-lab/main.tf), tested design (offline); routing design only | Detection must be enabled, routed, monitored and periodically exercised. |

## Shared responsibility shift

On the VPS, the operator manages the guest OS, container runtime, firewall,
patching, storage and recovery. Contabo manages its physical facilities and
underlying virtualization; AWS similarly manages physical security and its
infrastructure, and KMS manages the key-protection hardware. AWS does not manage
our IAM trust and policies, workload patching in every service, public bucket
settings, data classification, backups, or incident response. Cross-account
trust, IAM policy sprawl and unintended public access introduce additional risks.

The offline tests use a mocked provider: they check planned configuration, not
AWS authorization, cloud behavior, drift or operating effectiveness.
