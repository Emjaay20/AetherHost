# Infrastructure security implementation and validation

Date: 19 November 2026. Scope: local AetherHost repository changes and tests.
No production deployment, credential rotation, cloud apply, DB maintenance, live
incident exercise or recovery operation was executed.

The AWS security lab is intentionally unprovisioned. It is Terraform-validated
but excluded from the mandatory Checkov gate until an AWS account, cost review
and account-specific controls have been approved. AetherHost production runs on
the VPS; this release creates no AWS resources.

## Implemented

- Server-owned expiring service credentials and authoritative resource ownership
  for Rust router/logd and Actix. Identity headers cannot establish authority.
  Registry files reject unsafe Unix permissions; router removes credentials before
  upstream forwarding. Metrics access fails closed without credentials. WebSocket
  sessions expire at token expiry or after 15 minutes.
- Dedicated-key vault startup checks, named-key rotation, v2 application-bound
  AES-GCM additional authenticated data, strict envelope parsing and legacy read
  compatibility. Maintenance tooling dry-runs and uses compare-and-swap updates.
- CI-gated reusable image publication, image vulnerability scans before signing,
  SBOM/provenance generation, pinned Actions, blocking Checkov, expected Cosign
  identity/issuer verification, digest deployment and readiness failure handling.
  API/dashboard/agent images have no mutable Compose fallback. Production images
  include compiled maintenance commands. Secret files are excluded from builds.
- Kubernetes digest requirement, non-root/seccomp configuration, token mounting
  disabled, identity secret mounts, scoped ingress/egress NetworkPolicy and a
  server-side restricted-admission negative test that checks the actual rejection.
- Inherited vulnerability exception register with owner/rationale/tracking/expiry,
  CI policy checks, scheduled source scans and a digest-based fleet scanner/timer.
- Database classification comments, separate opt-in access profiles, redacted
  reporting view, bounded log-retention maintenance and retention index. Redaction
  also covers URL credentials, quoted assignments and multiline private keys.
- Recovery tooling that checks tagged snapshot age, samples backup data, loads SQL
  into an isolated PostgreSQL instance and validates table/tenant relationships.
- Optional AWS Terraform root for private versioned S3 evidence/audit storage,
  KMS rotation, CloudTrail, scoped GitHub OIDC upload role and opt-in GuardDuty.
- Revised docs page, control map, threat model, case study, key rotation/access/
  vulnerability/incident/recovery runbooks and explicit rollout checklist.
- Workspace Rust formatting normalized so the whole-workspace format check passes.

## Observed local results

| Check | Result | Scope / limitation |
| --- | --- | --- |
| API build, including maintenance command compilation | Passed | No production image build or deployment |
| API unit tests | 106 passed across 20 suites | Local mocked/unit coverage |
| API e2e suite | 10 passed across 2 suites | Repository test harness; not live production |
| API and maintenance TypeScript checks | Passed | Compile-time validation |
| Prisma schema validation | Passed | Does not apply SQL migration or test DB grants |
| Dashboard TypeScript check | Passed | Includes revised docs page |
| Dashboard tests | 6 passed | Existing repository tests |
| Dashboard production build | Failed: external font fetch unavailable | Google Fonts requests for Inter/IBM Plex could not complete in this environment; production bundling not verified |
| Python security policy/release tests | 7 passed | Release verifier uses subprocess doubles; does not prove a real registry signature |
| Security policy check | Passed | Full Action references and current exception-register consistency/expiry |
| Strict Rust Clippy, workspace/all targets | Passed | `-D warnings` |
| Rust workspace format check | Passed | Entire workspace |
| Full Rust workspace test command | Failed due environment restriction | Existing router integration test cannot bind `127.0.0.1:0`: Operation not permitted |
| Rust tests with that single listener test explicitly excluded | 36 passed; 1 filtered | Includes identity/Actix/logd/forged-header coverage and doc tests; not a fully passing unfiltered command |
| Go vet and tests | Passed | Agent package |
| Six YAML configurations | Parsed successfully | Does not substitute for Helm rendering or Kubernetes validation |
| Six changed shell entry points | Syntax checks passed | Does not substitute for execution on a configured host |
| Git whitespace/diff check | Passed | Working tree changes remain local |

The full Rust test remains enabled in CI. It was not silently disabled or rewritten
to hide the sandbox failure. No benchmark or performance improvement is claimed.

## External verification not completed

- Docker daemon access was denied by the sandbox. Images, KinD, network enforcement,
  admission, full service startup and PostgreSQL recovery could not run here.
- Terraform, Helm, Checkov, Trivy and Cosign were not available locally. Their
  workflows/configuration require real CI results. New blocking image/IaC scans
  may uncover findings; triage them without bypassing the gates.
- GitHub branch-protection read returned HTTP 403, “Resource not accessible by
  integration.” Effective repository settings could not be verified or modified.
- AWS configuration is unapplied; no runtime cloud posture or cost outcome is claimed.
- Protected vault keys, legacy migration, registry ownership reconciliation, operator
  privilege removal, dashboard public build variables, SSH host fingerprint,
  deployed digests, scanner installation, log retention schedule and durable audit
  collection require operational configuration and observed evidence.
- KMS data-key wrapping for the application vault, dynamic service identity, complete
  fleet isolation and full platform recovery remain separate follow-through work;
  the AWS lab and database drill do not establish those outcomes automatically.

## Next operational action

Follow [the rollout checklist](../security/rollout.md). Bootstrap the root-owned
release entry point and protected configuration before enabling the changed deploy
workflow. Keep an independent administrator recovery path while removing old broad
sudo grants. Apply migrations and access roles under separate reviewed credentials.
Run and retain actual signature, scan, revocation and recovery results before
promoting repository implementation status to verified production effectiveness.
