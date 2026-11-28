# Security control mapping (self-assessment)

This mapping is an engineering aid, not an audit or certification. AetherHost
is neither SOC 2 compliant nor ISO 27001 certified. Control references indicate
where evidence may contribute; they do not establish full criterion coverage.
Evidence levels are designed, implemented, tested, and operating; an existing
file or a test alone does not prove sustained operational effectiveness.

| Control in [controls.md](controls.md) | SOC 2 TSC | ISO 27001:2022 Annex A | Evidence and level | Gap |
| --- | --- | --- | --- | --- |
| Identity and tenant access | CC6.1, CC6.2, CC6.3 | 5.15, 5.16, 5.18 | [Rollout evidence](../validation/2026-11-20-security-rollout-evidence.md), tested | Production revocation and recurring access reviews. |
| Secret confidentiality | CC6.1, CC6.7, C1.1 | 5.15, 8.24 | [Key rotation](key-rotation.md), implemented | Protected keys, migration and backup-key recovery. |
| Runtime boundaries | CC6.1, CC6.6, CC6.7 | 8.20, 8.22, 8.27 | [Rollout evidence](../validation/2026-11-20-security-rollout-evidence.md), tested | Independently observed policy and network enforcement. |
| Change and release integrity | CC8.1, CC7.1 | 8.25, 8.29, 8.32 | [Image publication](../../.github/workflows/publish-images.yml), implemented | Branch protection and production deployment review evidence. |
| Vulnerability lifecycle | CC7.1, CC7.2 | 8.8, 8.16 | [CI scanning](../../.github/workflows/ci.yml), implemented | Sustained finding triage and patch verification. |
| Data handling | C1.1, C1.2, CC6.1 | 5.12, 5.33, 8.10 | [Data inventory](data-inventory.md), implemented | Retention schedule, access review and deletion evidence. |
| Auditability | CC7.2, CC7.3 | 8.15, 8.16 | [Control description](controls.md), implemented | Durable tamper-resistant collection and retention. |
| Recovery | A1.2, A1.3 | 8.13, 8.14 | [Recovery drill](disaster-recovery-drill.md), designed | Current isolated full restore and measured recovery objectives. |
| Incident handling | CC7.3, CC7.4, CC7.5 | 5.24, 5.25, 5.26, 5.27, 5.28 | [Incident record](../incidents/2026-11-07-platform-overwrite.md), operating event documented | Exercise execution, response timing and closure evidence. |
| Cloud baseline | CC6.1, CC6.6, CC7.1 | 5.23, 8.9, 8.20 | [AWS translation](aws-translation.md), design / offline tests | No live AWS assessment, deployment or drift review. |

## What a SOC 2 Type II audit would still need

Documented and approved policies, HR and vendor controls, repeatable access
reviews, evidence spanning an appropriate observation period, and assessment by
an independent auditor. These mappings are not a substitute for that work.
