# Security rollout and evidence checklist

Updated 20 November 2026 from [observed CI/deployment evidence](../validation/2026-11-20-security-rollout-evidence.md).
The previous “everything is local” summary is superseded: the signed release
`c173abb65937a41c967e2fbfaac37c7328a6fdfd` deployed successfully.
A verified release is not evidence that every operational control is finished.

| Order | Action | Current status | Remaining acceptance evidence |
| --- | --- | --- | --- |
| 1 | Code, CI and inherited findings | CI verified | Remediate/close expiring inherited findings; documented exceptions remain risks |
| 2 | Vault configuration and legacy compatibility | API startup verified | Read-only inventory and migration preview; no key rotation inferred |
| 3 | Public build configuration, registry pulls and Cosign | Verified in real build/deploy | Preserve dated signature/SBOM evidence for each release |
| 4 | Root-owned release path and operator least privilege | Entry point executed | Review effective permissions, broader sudo grants, Docker group and independent emergency access |
| 5 | Branch/environment protection and SSH fingerprint | Partial | Add Terraform/Kubernetes required contexts; restrict production to main; fingerprint is now mandatory in the next deployment |
| 6 | Approved-revision deploy and readiness | Verified for linked release | New releases record their own digests and runtime observations |
| 7 | Secret migration and retained recovery keys | Preview collection implemented | Review preview; protect backup/keys, then apply migration and verify no conflicts |
| 8 | Trusted private-service ownership registry | CI tested | Provision/reconcile only on target deployments of those services; no production registry inferred |
| 9 | Scanner, backup image and recovery | Fleet installer/scan and timers executed | Review current digest-matched reports, backup image and fresh isolated restore result |
| 10 | Deployment-log retention | 90-day read-only preview implemented | Review policy/preview; enable restricted scheduled cleanup explicitly |
| 11 | Kubernetes reconciliation and isolation | KinD admission/rollout verified | Target-cluster identity/digest review and observed CNI ingress/egress denials |
| 12 | Optional AWS environment | Both Terraform roots validated | Reviewed account/cost/state plan, then actual OIDC/CloudTrail/CSPM evidence after apply |
| 13 | Incident exercise and full recovery | Runbooks and regression coverage | Execute and record actual containment and user-workflow recovery |

The read-only post-deploy collector produces private host evidence plus a value-free
CI summary. It never rotates keys, changes privileges, migrates secrets, deletes
logs, activates AWS resources or starts a destructive restore.

[Administrator activation steps](admin-activation.md) cover the settings that the
GitHub integration cannot modify. Do not replace keys or remove existing privileged
access without a reviewed plan, protected recovery material and a tested alternate
administrator path.
