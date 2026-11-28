mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-security-lab" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-west-1:123456789012:key/mock" }
  }
}

override_resource {
  target = aws_s3_bucket.evidence
  values = { arn = "arn:aws:s3:::mock-evidence" }
}
override_resource {
  target = aws_s3_bucket.audit
  values = { arn = "arn:aws:s3:::mock-audit" }
}
override_resource {
  target = aws_kms_key.evidence
  values = { arn = "arn:aws:kms:eu-west-1:123456789012:key/mock" }
}

variables {
  github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
}

# Terraform 1.9 generates computed mock values at mock apply time. This
# in-memory operation uses only the mocked provider and contacts no AWS APIs.
run "prepare_mock_state" {
  command = apply
}

run "baseline" {
  command = plan

  assert {
    condition     = length(jsondecode(aws_iam_role.ci_evidence.assume_role_policy).Statement) == 1 && jsondecode(aws_iam_role.ci_evidence.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity" && jsondecode(aws_iam_role.ci_evidence.assume_role_policy).Statement[0].Principal.Federated == var.github_oidc_provider_arn && jsondecode(aws_iam_role.ci_evidence.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com" && jsondecode(aws_iam_role.ci_evidence.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:${var.github_repository}:ref:refs/heads/main"
    error_message = "OIDC trust must match only the main branch and expected audience."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.ci_evidence.policy).Statement[0].Action) == 1 && jsondecode(aws_iam_role_policy.ci_evidence.policy).Statement[0].Action[0] == "s3:PutObject" && jsondecode(aws_iam_role_policy.ci_evidence.policy).Statement[0].Resource == "${aws_s3_bucket.evidence.arn}/evidence/*" && alltrue([for statement in jsondecode(aws_iam_role_policy.ci_evidence.policy).Statement : alltrue([for action in statement.Action : !strcontains(action, "*") && (!startswith(lower(action), "s3:") || action == "s3:PutObject")])]) && length([for statement in jsondecode(aws_iam_role_policy.ci_evidence.policy).Statement : statement if contains(statement.Action, "s3:PutObject")]) == 1
    error_message = "The role must not grant read, delete or wildcard actions and may write only to evidence/."
  }
  assert {
    condition     = alltrue([for pair in [{ policy = aws_s3_bucket_policy.evidence.policy, arn = aws_s3_bucket.evidence.arn }, { policy = aws_s3_bucket_policy.audit.policy, arn = aws_s3_bucket.audit.arn }] : anytrue([for statement in jsondecode(pair.policy).Statement : statement.Effect == "Deny" && try(statement.Principal == "*" && statement.Action == "s3:*" && toset(statement.Resource) == toset([pair.arn, "${pair.arn}/*"]) && statement.Condition.Bool["aws:SecureTransport"] == "false", false)])])
    error_message = "Both bucket policies must deny insecure transport."
  }
  assert {
    condition     = alltrue([for block in aws_s3_bucket_public_access_block.all : block.block_public_acls && block.block_public_policy && block.ignore_public_acls && block.restrict_public_buckets]) && alltrue([for v in aws_s3_bucket_versioning.all : v.versioning_configuration[0].status == "Enabled"]) && alltrue([for s in aws_s3_bucket_server_side_encryption_configuration.all : alltrue([for rule in s.rule : rule.apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms" && rule.apply_server_side_encryption_by_default[0].kms_master_key_id == aws_kms_key.evidence.arn])])
    error_message = "All buckets must block public access, use versioning and encrypt with the lab KMS key."
  }
  assert {
    condition     = aws_kms_key.evidence.enable_key_rotation && aws_cloudtrail.security.is_multi_region_trail && aws_cloudtrail.security.enable_log_file_validation && length(aws_guardduty_detector.security) == 0
    error_message = "Key rotation and multi-region validated CloudTrail are required; GuardDuty defaults off."
  }
}

run "guardduty_opt_in" {
  command = plan
  variables { enable_guardduty = true }
  assert {
    condition     = length(aws_guardduty_detector.security) == 1 && aws_guardduty_detector.security[0].enable
    error_message = "Opting in must create one enabled GuardDuty detector."
  }
}

run "invalid_repository" {
  command = plan
  variables { github_repository = "not-an-owner-and-repository" }
  expect_failures = [var.github_repository]
}
