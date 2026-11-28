# AetherHost infrastructure security case study

AetherHost is a team-built multi-tenant developer platform. Present individual
contributions with reviewed commits and operational evidence; do not attribute
all platform work to one person or imply unmeasured operating scale.

## Engineering narrative

The platform hosts tenant applications alongside a control plane. The security
work focuses on trustworthy identity and ownership, constrained deployment
privileges, secret confidentiality, release provenance, and recoverability.

The implementation now includes server-owned expiring service credentials,
application-bound AES-GCM encryption with key rotation/migration tooling, blocking
security gates, signed image publication and digest verification at deployment,
Kubernetes restrictions, exception lifecycle checks, and isolated database restore
tooling. An optional AWS Terraform environment demonstrates narrowly scoped OIDC,
private encrypted evidence storage and CloudTrail configuration.

## Demonstrations

| Scenario | Expected behavior | Evidence |
| --- | --- | --- |
| Forged tenant/role headers | Cannot establish identity or change resource ownership | Rust identity and endpoint denial tests |
| Cross-tenant log access | Denied by authoritative ownership and policy | Log daemon integration tests |
| Ciphertext moved between applications | Authentication failure | Vault context tests |
| Encryption-key rotation | Old keys readable during transition; new writes use selected key | Rotation tests and migration dry-run |
| Unsigned or mislabeled image | Deployment verification fails | Verification regression tests; live Cosign evidence still required |
| Expired vulnerability exception | CI policy fails | Policy lifecycle tests |
| Privileged Kubernetes pod | Restricted admission rejects | KinD CI test; runtime evidence required |
| Backup recovery | SQL imports and relational checks pass in isolated DB | Actual upgraded drill result required |

## Interview discussion

Explain the tradeoffs: static service registry versus dynamic identity reconciliation;
application encryption versus KMS data-key wrapping; API proxy permissions versus
untrusted-workload isolation; signature verification versus mutable image labels;
and database recovery versus full service recovery. Explain residual risks and
the next control with an owner rather than claiming every risk is eliminated.

The November 18 stale-image incident is a useful documented example: a healthy
container did not prove the intended revision was running. The new release chain
addresses provenance explicitly. Do not invent performance gains or production
outcomes; attach dated logs, CI runs, reviewed changes and measured results.

## Claims boundary

No audited compliance claim, full platform RTO, AWS production deployment,
immutable audit storage, or globally completed operating control coverage is
established by this repository alone. See `docs/security/controls.md` and the
validation report for exact local results and external activation requirements.

## Framework mapping

See the [self-assessed control mapping](../security/compliance-mapping.md) and
[AWS translation](../security/aws-translation.md). Neither asserts certification
or that the AWS design was deployed.
