# Infrastructure security gap briefs

> Historical planning brief: the descriptions below capture the proposed work,
> not its current completion status. For implemented controls, test results and
> remaining gaps, see the [validation report](../validation/2026-11-28-offline-security-gap-work.md)
> and [control mapping](../security/controls.md).

Five self-contained tasks that close the gaps between AetherHost and a senior
infrastructure security role (AWS operations, CSPM, compliance mapping, data
tagging, Kubernetes admission control). Each brief can go to a separate agent
or session. Briefs 1–5 cost nothing and need no AWS account. Do brief 1 before
brief 3, because brief 3 cites its evidence. Brief 2 is an optional extra that
needs a live AWS account.

**Framing:** same controls, different platform. AetherHost runs these controls
in production on infrastructure the owner is fully responsible for (Contabo VPS +
Cloudflare). The briefs show how each control translates to AWS, and prove the
AWS design with offline tests. They never claim AWS was operated.

Rules for every brief (from `AGENTS.md` and the existing security docs):

- No unbacked claims. Keep code that exists, a passing test, applied config and
  proven effectiveness as separate levels of evidence, the way `docs/security/controls.md` does.
- Never commit credentials, account IDs, ARNs with account numbers, Terraform
  state or raw cloud output. Store sanitized evidence only.
- Add a row to `docs/security/posture-log.md` for each finding or decision.
- Leave root SSH settings on the VPS unchanged.

---

## Brief 1: Contabo-to-AWS control translation, proven offline ($0)

**Cost:** none. No AWS account, credentials or card needed. Everything runs
locally and in the existing GitHub Actions CI.

**Goal:** show that controls the owner runs in production on a self-managed VPS
translate directly to AWS. Each control gets two kinds of evidence: **operating**
evidence from Contabo, and **tested design** evidence for AWS.

### Part A: Translation map (doc)

Create `docs/security/aws-translation.md`. For each control below, write one
row with these columns: control objective, what runs on Contabo today (file
link), evidence level on Contabo (link to `docs/validation/`, `docs/incidents/`
or `posture-log.md`), AWS-native equivalent, AWS implementation in this repo
(Terraform file or "design only"), and what changes on AWS (the managed service
takes over part of the responsibility, or adds a new risk).

| Control | Contabo source to cite | AWS equivalent |
| --- | --- | --- |
| Network perimeter | `terraform/firewall.tf`, `terraform/dns.tf` (Cloudflare WAF) | Security Groups, NACLs, AWS WAF |
| Least-privilege deploy access | `deploy/sudoers/aetherhost-deploy`, `deploy/install-ci-deploy-access.sh` | GitHub OIDC → IAM role (lab), SSM Session Manager |
| Secrets at rest | `SecretVaultService`, `docs/security/key-rotation.md` | KMS envelope encryption, Secrets Manager |
| Audit logging | authz audit events, `docs/security/controls.md` "Auditability" | CloudTrail (lab), CloudWatch Logs |
| Vulnerability management | Trivy gates in `ci.yml`, `aetherhost-fleet-scan.timer`, `vulnerability-exceptions.json` | ECR scanning, Amazon Inspector, Security Hub |
| Image integrity | `publish-images.yml` (cosign + SBOM), `deploy/verify-image.sh` | ECR + AWS Signer, or Kyverno verifyImages on EKS |
| Container hardening | `docker-compose.prod.yml` (read-only, `cap_drop: ALL`) | ECS task `readonlyRootFilesystem`, EKS pod security |
| Backup and recovery | `deploy/backup/backup.sh`, `restore-check.sh`, DR drill doc | S3 versioning + Object Lock, AWS Backup |
| Database least privilege | `deploy/database/access-roles.sql` | RDS + IAM DB auth, separate roles |
| Data handling | `data-inventory.md`, `log-redaction.ts`, retention command | Macie classification, S3 lifecycle, CloudWatch log retention |
| Detection and response | `docs/incidents/*`, `incident-exercise.md`, operation-alert units | GuardDuty, EventBridge → SNS alerting |

Rules:
- Use evidence levels from `controls.md` (designed / implemented / tested /
  operating). The Contabo column can say "operating" only where a validation or
  incident doc proves it.
- Each AWS row says "tested design (offline)" or "design only". Never say
  "deployed" or "operated".
- Add a short "Shared responsibility shift" section: what the owner does by hand
  on the VPS that AWS manages (hypervisor patching, physical security, KMS HSMs),
  and what AWS adds (IAM policy sprawl, public-bucket risk, cross-account trust).

Doing this table well is the strongest single interview artifact. Keep it
accurate rather than long.

### Part B: Offline Terraform tests with a mocked AWS provider

1. In `terraform/aws-security-lab/main.tf`, raise `required_version` to
   `>= 1.7.0`, which `mock_provider` needs. CI already pins 1.9.8.
2. Add `terraform/aws-security-lab/tests/security.tftest.hcl` using
   `mock_provider "aws" {}` and `command = plan` runs. Assert on resource
   arguments and on the IAM and bucket policy JSON (use `jsondecode`). Cover
   at least:
   - The OIDC role trust policy requires `aud = sts.amazonaws.com` and a `sub`
     limited to `repo:<var.github_repository>:ref:refs/heads/main`, so pull
     request subjects can't assume the role.
   - The role policy allows `s3:PutObject` only on `evidence/*` and has no
     `s3:GetObject`, `s3:DeleteObject` or `*` actions.
   - The bucket policy denies `aws:SecureTransport = false`.
   - Public access block has all four flags set to `true`; versioning is enabled;
     SSE uses the lab KMS key.
   - The KMS key has `enable_key_rotation = true`.
   - CloudTrail is multi-region with log file validation on. If log file
     validation isn't set today, add it and record it in the posture log.
   - `enable_guardduty = false` creates no detector, and `true` creates one.
   - A negative test: `expect_failures` on variable validation. Add a
     `validation` block to `github_repository` (`owner/name` format) if none exists.
3. Add a CI step to the existing Terraform job in `.github/workflows/ci.yml`:
   `terraform -chdir=terraform/aws-security-lab init -backend=false`, then `validate`
   and `test`. Use no AWS credentials.

### Part C: Bring the lab under Checkov

Checkov currently skips this module (`skip_path: terraform/aws-security-lab` in
`ci.yml`). Remove the skip, or add a second Checkov step scoped to the lab, so
the AWS code gets CSPM-style misconfiguration scanning. Fix what's cheap. For
each check you skip, add an inline `#checkov:skip=CKV_AWS_xxx: <reason>` with a
matching posture-log row. Expect checks such as S3 access logging, cross-region
replication, Object Lock and SNS on CloudTrail. Skipping costly ones with a
documented reason is fine. That counts as triage evidence.

### Done when

- `aws-translation.md` covers every control above with working links and
  honest evidence levels.
- `terraform test` passes locally and in CI with no AWS credentials, and
  includes at least one negative assertion.
- Checkov scans the lab, and each skipped check has a reason and a posture-log entry.
- The lab README and `controls.md` "Cloud baseline" row say: "tested design,
  offline (mocked provider + Checkov); not deployed."

---

## Brief 2 (optional, needs a live AWS account): Apply the lab and run Prowler

Only do this if the owner opens an AWS account on the free plan. At the time of
writing, new accounts could choose a credit-backed free plan, but check AWS's
current terms first. A card is still needed at signup. Expected spend is the KMS
key (about $1 a month) plus CloudTrail data events. Destroy the lab when finished.

User-only steps: create the account, OIDC provider and protected remote state;
review the plan; then run `apply` and later `destroy` yourself.

Agent steps:
1. Add a `workflow_dispatch` evidence workflow (`id-token: write`, actions
   pinned by SHA). It uploads a synthetic report to `evidence/` and checks that
   writing outside the prefix, deleting an object and reading an unrelated
   bucket are all denied.
2. Add a read-only `audit` role (`SecurityAudit` + `ViewOnlyAccess`). The user
   runs Prowler as that role. The agent triages the findings into
   `docs/security/cspm-findings.md` (no ARNs), fixes 3–5 in Terraform, and
   records before and after counts after a rescan.
3. Write `docs/validation/<date>-aws-security-lab.md` with sanitized CloudTrail
   event IDs. Upgrade the evidence level in `aws-translation.md` from "tested
   design" to "applied in an isolated lab" only for the rows this covers.

---

## Brief 3: SOC 2 / ISO 27001 control mapping

**Depends on:** nothing (doc-only). It's stronger after brief 1 (and brief 2 if done), so cite
their evidence if it exists.

**Goal:** show you can work with compliance frameworks without claiming
certification.

**Steps:**
1. Create `docs/security/compliance-mapping.md`. Map each row of
   `docs/security/controls.md` to the SOC 2 Trust Services Criteria (CC6.x
   logical access, CC7.x system operations/monitoring, CC8.1 change
   management, A1.x availability, C1.x confidentiality) and to ISO 27001:2022
   Annex A controls (for example 5.15 access control, 8.8 technical
   vulnerability management, 8.13 backup, 8.24 cryptography, 8.25–8.32 secure
   development and change management, 5.24–5.28 incident management).
2. For each mapping, list: the AetherHost control, the evidence link (an
   existing file under `docs/validation/`, `docs/incidents/` or a workflow),
   the evidence level (designed / implemented / tested / operating), and the
   gap.
3. Add a short "What a SOC 2 Type II audit would still need" section covering
   policies, HR and vendor controls, an observation period, an independent
   auditor and access reviews over time. This is what keeps the doc honest.
4. Link it from `controls.md` and `docs/portfolio/staff-security-case-study.md`.

**Done when:** every `controls.md` row is mapped to both frameworks and every
evidence link resolves. The words "compliant" and "certified" appear only
when saying the project is neither.

---

## Brief 4: Column-level data classification enforced in CI

**Goal:** match "database column tagging". Turn `docs/security/data-inventory.md`
from a table in a doc into something the schema enforces.

**Steps:**
1. In `apps/api/prisma/schema.prisma` (15 models), annotate every field with a
   triple-slash doc comment tag: `/// @data(public|internal|confidential|secret|personal)`.
   Use the classifications in `data-inventory.md`, and default ordinary
   metadata to `internal`.
2. Add `apps/api/scripts/check-data-classification.ts`, which parses the schema
   (with `@mrleebo/prisma-ast` or a simple line parser) and fails if any field
   has no tag or an unknown tag. It should also generate
   `docs/security/data-classification.generated.md` (model, field, class) and
   fail if the committed file is stale.
3. Add rules: fields tagged `secret` or `personal` must appear in a
   `SENSITIVE_FIELDS` allowlist exported from the API and used by
   `apps/api/src/applications/log-redaction.ts` and by audit-metadata
   serialization. Add a unit test proving that a tagged field's value is
   redacted from a log line and from audit metadata.
4. Add a `pnpm --filter @aetherhost/api security:classification` script and run
   it in the existing API CI job.
5. In `data-inventory.md`, add a pointer to the generated file and the CI gate.

**Done when:** CI fails on a new untagged column (demonstrate this with a test
fixture schema, not a commit to the real schema), the redaction test passes, and
`pnpm --filter @aetherhost/api test` and the `tsc` typecheck pass.

---

## Brief 5: Kyverno admission policies in KinD (signed, hardened images only)

**Goal:** connect the existing cosign signing pipeline to enforcement inside the
cluster, which covers "Kubernetes image hardening" and "automated guardrails".

**Steps:**
1. Add `deploy/policies/kyverno/` with these ClusterPolicies (`Enforce` mode):
   - `verify-image-signature`: a `verifyImages` rule for
     `ghcr.io/emjaay20/aether-platform*` using the keyless cosign identity
     (issuer `https://token.actions.githubusercontent.com`, subject matching
     this repository's `publish-images.yml` on `main`). Copy the identity flags
     `deploy/verify-image.sh` already uses so the two can't drift.
   - `require-digest`: image references must be pinned by `@sha256:`.
   - `restrict-pod-security`: `runAsNonRoot`, `readOnlyRootFilesystem`,
     `allowPrivilegeEscalation: false`, dropping `ALL` capabilities, and a
     `RuntimeDefault` seccomp profile.
   - `disallow-default-namespace` and a requirement that resource limits are set.
2. Extend the KinD job in `.github/workflows/ci.yml` (around the `helm/kind-action`
   step): install Kyverno from a pinned chart version, apply the policies, then
   - install the chart and assert it is admitted;
   - apply negative fixtures under `deploy/policies/kyverno/tests/` (an
     unsigned image, a `:latest` tag, a root container, a privileged
     container) and assert that each is **denied**. Use `kyverno test` for
     offline policy unit tests in addition to the live check.
   The local `:latest` KinD image will fail the signature and digest policies.
   Either exempt the `aether-system` namespace for the locally loaded image in
   the smoke test and test signature enforcement separately against a published
   signed digest, or deploy by digest from GHCR. Explain the choice in the PR.
3. Make sure `deploy/helm/aether-platform/templates/deployment.yaml` passes the
   pod-security policy as it is. If it doesn't, fix the chart, not the policy.
4. Document the setup in `deploy/KUBERNETES.md`, and update the "Runtime
   boundaries" row in `controls.md` to "admission-enforced in CI (KinD)".

**Done when:** CI shows the chart admitted and every negative fixture denied,
and `helm lint` plus kubeconform still pass.
