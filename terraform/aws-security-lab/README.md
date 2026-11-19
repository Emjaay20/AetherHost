# Isolated AWS security environment

This optional root module creates encrypted private evidence storage, a versioned
CloudTrail bucket, multi-region management and evidence-object audit events, and
a GitHub OIDC role that can only write the evidence prefix. Its KMS use is restricted to the
evidence key through S3 (including decrypt needed for multipart/bucket-key
operations); the role has no S3 read/delete permissions. GuardDuty is opt-in.
It does not move AetherHost production or establish compliance.

Use an isolated AWS account. Review costs (CloudTrail data events, S3, KMS and
optional GuardDuty), existing trails, naming and account policies before apply.
Use a protected remote Terraform backend with encryption, locking and restricted
state access; do not commit state or credentials. This module deliberately does
not assume your account's backend configuration.

```sh
terraform -chdir=terraform/aws-security-lab init
terraform -chdir=terraform/aws-security-lab validate
terraform -chdir=terraform/aws-security-lab plan -out=lab.plan \
  -var='github_oidc_provider_arn=arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com'
# Review the plan, configure protected state, then apply explicitly.
```

Evidence exercise after deployment:
1. Assume the role using a main-branch GitHub OIDC token with `aud=sts.amazonaws.com`.
2. Upload a synthetic report under `evidence/`; retain the CloudTrail event ID.
3. Attempt a write outside that prefix, object deletion and an unrelated bucket read;
   all must fail. Test a pull-request subject cannot assume the role.
4. Validate encryption, public access blocks, versioning, TLS denial, KMS rotation
   and trail logging using AWS API output. Store only sanitized evidence.
5. Run a read-only CSPM assessment under a separately scoped audit role. Track
   each finding through remediation and rescan. The CI upload role cannot audit
   or administer the account.

No AWS resources were applied by the implementation session. Account-wide threat
services, log retention/object lock, S3 access logging, alerts and backend controls
must be reviewed against your account requirements before calling this production ready.
