# Offline security gap validation — 28 November 2026

Scope: local repository and a disposable KinD test cluster; no production
server, AWS account or existing Kubernetes cluster was modified. AWS policy
checks use a mocked provider and do not prove AWS operating behavior.

| Check | Observed result |
| --- | --- |
| AWS Terraform 1.9.8 validation and mocked tests | Four runs passed, including main-branch trust, GuardDuty opt-in and invalid repository input. A mocked in-memory apply supplies computed values before plan assertions. |
| Checkov Terraform scan | 47 passed, zero failed, 13 skipped across both Terraform roots. Eleven skips concern the AWS lab and are documented in the posture log; other existing skips are outside that lab. |
| API unit tests | 26 suites and 157 tests passed, including classification and nested audit/log redaction checks. |
| API end-to-end tests | 2 suites and 10 tests passed. |
| Schema classification | 164 model fields checked; unknown and missing labels and absent sensitive-name mappings are rejected in fixtures. |
| API TypeScript build and security typechecks; Prisma validation | Passed locally. |
| Kyverno CLI 1.19.2 | Seven workload-policy fixture expectations passed. |
| Kyverno 1.19.2 in KinD (chart 3.9.2) | Safe fixture and synthetic Helm chart server-side dry runs admitted. Latest tag, root, root override, privileged, no-limits and default-namespace fixtures rejected by the policy. A non-verifiable platform digest was rejected by the image signature policy. |
| Helm lint | Passed. |
| Kubeconform | Helm: 6 valid. GitOps: 1 valid and 3 skipped for unavailable schemas; none invalid. |
| Signed-image job wiring | Workflow checked with actionlint; positive/negative script flow checked against a local kubectl stub. This does not test registry access or a real signature. |

Important limits: the synthetic chart uses a non-platform image and does not
prove signature acceptance. The release workflow now passes the freshly signed
platform digest to a separate KinD/Kyverno admission job, which requires that
digest to be accepted and the same release's tag-only reference to be denied.
The job has not yet run against a published image; its success must be recorded
from an actual main-branch run before claiming positive signature enforcement.
Production deployment is gated on this job. The locally built `:latest` CI
smoke workload is installed before Kyverno and does not prove signed-image
admission. No CI run or production rollout is claimed by these local results.
Kyverno's legacy ClusterPolicy type is deprecated; see [Kubernetes notes](../../deploy/KUBERNETES.md).

The audit metadata sanitizer currently uses Prisma 5 middleware for direct
`AuditLog` writes. That API is deprecated and removed in Prisma 6, and nested
audit writes are not covered. Replace it with a Prisma-version-compatible design
and explicitly test nested writes before upgrading; do not assume a client
extension alone intercepts every nested write.
