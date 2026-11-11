# CI security baseline

## Controls enabled

- Every third-party GitHub Action in `.github/workflows/ci.yml` is pinned to a
  full commit SHA.
- The workflow defaults to `contents: read`; no job receives write access by
  default.
- Gitleaks scans the repository for accidentally committed credentials.
- Trivy scans source dependencies and configuration for high and critical
  findings.
- Dependabot proposes weekly updates for JavaScript, Go, Rust, and GitHub
  Actions dependencies.

## Current transition state

Gitleaks and Trivy are intentionally **reporting-only** at present. This is a
time-bounded exception, not a passed control: a historical Svix credential was
identified in the repository and must be rotated in Svix before secret scanning
can become a blocking release gate. Existing Trivy findings also need an owner,
decision, and remediation target before they can safely block all releases.

The date and evidence for each of these actions must be recorded in
`docs/security/posture-log.md` before changing either workflow setting:

1. Rotate and revoke the historical Svix credential in the Svix dashboard.
2. Confirm all deployed services use the replacement through their secret
   configuration; do not commit the value.
3. Run Gitleaks against the default branch and remediate or formally remove the
   historical finding from the scanned history according to the incident plan.
4. Run Trivy, triage each high/critical result, and document its disposition.
5. Remove Gitleaks `continue-on-error` and set Trivy `exit-code: '1'`.

## Manual repository settings still required

GitHub branch protection is an account-level repository setting, not a file in
this repository. An administrator must protect `main` with:

- pull requests required before merging;
- the TypeScript, Go, Rust, and security checks required to pass;
- direct pushes and force pushes disabled; and
- review dismissal when new commits are pushed.

Image publication, signed-image verification, and deployment identity changes
are intentionally separate changes: the current production deployment builds
locally on the VPS. They require a tested move to CI-built GHCR images and a
dedicated signing identity before the server can be restricted to signed pulls.

## Current VPS deployment identity

The CI SSH account is `engineer`, not root. A root-owned sudoers rule permits
exactly `/srv/aetherhost/control/deploy/deploy-production.sh`, allowing the
root-owned control-plane checkout to update and compose services to rebuild.

**Open risk:** the current VPS configuration also grants `engineer` broader
passwordless sudo rights. The single-command rule cannot reduce that existing
permission. SSH root access is unchanged by this control. Removing the broader
rule is a separate access-policy change and must be explicitly approved and
tested before this can be described as least privilege.
