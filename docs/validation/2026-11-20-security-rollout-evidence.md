# Security rollout evidence — 20 November 2026

This report supersedes the “local only / production pending” summary from 19 November.
It distinguishes observed CI/deployment outcomes from unfinished operational controls.
Evidence was retrieved directly from GitHub Actions, not inferred from source files.

## Verified release

- Source revision: `c173abb65937a41c967e2fbfaac37c7328a6fdfd`.
- [Successful CI and production deployment](https://github.com/Emjaay20/AetherHost/actions/runs/44712911205).
- Production deployment completed at 09:53:42 UTC / 10:53:42 WAT on 20 November.
- The deploy log records real Cosign claims/certificate verification for API, dashboard
  and agent digests, no pending Prisma migrations, successful readiness and
  “Verified release deployed” for the expected revision.
- All four publishing jobs built/scanned/signed their images and generated SBOMs.
  The successful dashboard image build resolves the earlier local font-fetch limitation.
- The deployment installed/started the fleet scan and listed backup, restore,
  maintenance and fleet timers. A timer listing alone is not recovery evidence.

| Component | Verified deployment digest |
| --- | --- |
| API | `sha256:75c618e7d20090814b1097fe9e88801b956d9467a446f9e42e65ea08666b45cf` |
| Dashboard | `sha256:458126f81eac26236c72373cc7023c1b3fecf7709c3dadf7b09800041eac1911` |
| Agent | `sha256:1368e3487244c8cbec2be02c05615beec6cce364e0b1d0514e5125d1679637fe` |

These are historical release digests, not permanent aliases for the newest release.

## Observed validation

| Area | Observed result | Limit |
| --- | --- | --- |
| API unit tests | 121 passed in 23 suites | CI harness, not production user-flow testing |
| API e2e tests | 10 passed in 2 suites | CI harness |
| Rust workspace | 36 tests passed; zero skipped, plus passing doc tests | The previously blocked listener test ran successfully in CI |
| Rust quality | Strict Clippy and cargo-deny jobs passed | No performance benchmark claim |
| Go | Vet/tests job passed | CI agent package |
| Dashboard | Typecheck/tests and production image build passed | Does not prove every browser workflow |
| Kubernetes | Helm lint, six valid rendered resources, rollout and health/metrics smoke checks passed | KinD, not a production Kubernetes cluster |
| Admission | Server-side privileged-pod rejection check passed | Does not prove CNI network enforcement |
| GitOps schemas | One valid built-in resource; three custom resources skipped | CRD schemas remain outside that validator's coverage |
| Terraform | Both independent roots validated | No AWS plan/apply or live drift assessment |
| Checkov | Mandatory job passed with zero checks passed, zero failed, two documented skips | This is narrow coverage, not a complete IaC security audit |
| Supply chain | Four signed/scanned builds; three production signatures verified | Image scans retain documented exceptions and unfixed-finding policy |

Job IDs in that run: API `136210483900`, Rust `136210484293`, Kubernetes
`136210484010`, Terraform `136210484407`, deploy `136212861535`.

## Repository and environment observations

A direct authenticated GitHub CLI read observed:
- administrator enforcement enabled;
- the API, Go, Rust and security checks required;
- zero required reviewer approvals (single-maintainer arrangement);
- the production environment had no branch policy or protection rules.

The Terraform and Kubernetes checks are missing from the effective required-context
list even though Terraform source declares them. The integration connection cannot
change administration settings (HTTP 403). Exact administrator steps are in
[admin activation](../security/admin-activation.md); they are not marked applied.

A successful SSH action does not prove a fingerprint was configured: the action
accepts an omitted fingerprint. The rollout adds a mandatory nonempty SHA256
fingerprint preflight to make future releases fail closed if it is absent.

## Runtime evidence collection

The follow-up deploy hook runs a read-only, allowlisted collector after readiness.
It compares running digests and hardening, summarizes effective operator privileges,
checks scanner freshness and systemd results, validates existing secret records,
runs migration/retention previews, and checks snapshot age when protected backup
configuration is available.

Reports are stored under the root-owned
`/var/lib/aetherhost/security/evidence/` with mode 0600. Only a value-free summary
is emitted to CI: no environment values, credentials, tenant identifiers, or
application log contents. Collection failure is explicit and does not take a
healthy deployment offline. An observed finding is not automatically a passed
control. No production keys are replaced, rows migrated or logs deleted by this hook.

This follow-up collector's results must be reviewed after its own deployment;
the earlier successful run cannot establish results for newly added code.

## Still open

- Apply the two missing required status contexts and main-only production
  environment branch policy using administrator access.
- Review effective sudo/Docker-group/checkout permissions before claiming
  operator least privilege. Preserve an independent tested administrator path.
- Review runtime secret inventory and migration preview; take a recoverable backup
  before any write migration or key retirement.
- Execute the upgraded isolated restore and a full application/workload recovery;
  no platform RTO or completed security incident exercise is claimed.
- Select/activate retention under restricted credentials after reviewing the
  90-day preview; this change does not silently delete logs.
- Provision/reconcile private-service identities only where those Rust services
  are deployed. CI demonstration credentials are not production identities.
- Verify Kubernetes CNI ingress/egress denials in an actual target environment.
- AWS remains optional and unprovisioned pending account/state/cost review.

The execution host became unavailable during this task. Existing GitHub connectivity
still permits source changes and CI-based verification, but direct local/SSH
operations cannot be claimed as completed.
