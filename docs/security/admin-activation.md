# Administrator activation

Observed 20 November 2026: effective main protection requires API/Go/Rust/security
checks, but not Terraform/Kubernetes. The production environment has no branch
policy. These operations require a GitHub administrator token; the integration
connection returns HTTP 403 and cannot apply them.

## Preserve existing protection and add missing checks

Use an authenticated administrator CLI. This endpoint adds contexts without
replacing strictness, administrator enforcement or the existing reviewer policy.

```sh
gh api --method POST repos/Emjaay20/AetherHost/branches/main/protection/required_status_checks/contexts --input - <<'JSON'
{"contexts":["Terraform Security Analysis (Checkov)","Kubernetes KinD & Helm Deployment Validation"]}
JSON
```

Read back protection and verify all six required contexts. Retain the existing
single-maintainer zero-approval arrangement until a second actual reviewer exists;
do not claim peer review that did not occur.

## Restrict production deployment to main

Review existing environment rules first. The observed environment currently has
none; preserve any rules added since this report.

```sh
gh api --method PUT repos/Emjaay20/AetherHost/environments/production --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api --method POST repos/Emjaay20/AetherHost/environments/production/deployment-branch-policies --input - <<'JSON'
{"name":"main","type":"branch"}
JSON
```

Read back the environment and branch-policy collection; confirm main is the only
permitted ref. Do not create a duplicate policy if rerunning these commands.

## SSH host identity

Set `SSH_HOST_FINGERPRINT` from a trusted console or independently verified host
key. Never trust a fingerprint collected solely over the same unverified network
connection. The deploy workflow now requires a SHA256 fingerprint before SSH.
A missing value fails before any server changes; do not remove that guard.

## Host privilege and recovery work

Review the private runtime report produced under
`/var/lib/aetherhost/security/evidence/`. Effective broad sudo, Docker-group
membership and writable deployment parents must be assessed together. Keep a
tested independent administrator session before removing old access. Use the
migration/retention previews and a verified backup to decide subsequent writes;
the collector performs no production data mutation.
