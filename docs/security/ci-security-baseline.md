# CI and release security baseline

The CI workflow defaults to read-only permissions. Third-party Actions use full
commit references; a dependency-free policy check rejects mutable references and
expired/unregistered vulnerability suppressions. Gitleaks, Trivy and Checkov are
blocking configuration. Suppressed findings are tracked risks, not clean results.

Image publication is a reusable workflow called only after all main CI gates
succeed on a main-branch push. Its job alone receives registry-write and OIDC
permissions. Built images are scanned before signing. The deployment job waits
for publication and uses the production environment and pinned SSH host fingerprint.
The root-owned entry point accepts only a full Git revision, refuses checkout
drift/stale main revisions, verifies image signer/issuer/revision, deploys digests,
and fails if readiness does not succeed. It does not grant the CI user arbitrary
Git, shell or Docker sudo access.

## Required external settings

- Apply and verify Terraform branch protections, including Terraform and Kubernetes
  checks. Configure real reviewer ownership appropriate to the team.
- Configure the protected production environment and deployment restrictions.
- Set SSH secrets including `SSH_HOST_FINGERPRINT`; keep root login and broad sudo
  policy under a reviewed host access configuration.
- Provide registry authentication for private image pulls and install reviewed Cosign.
- Set repository variables `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_BASE_DOMAIN` before publishing dashboard
  images. Only public build configuration belongs in these variables.
- Configure dedicated vault keys on the host before the new API starts.

First rollout requires an administrator to install the new root-owned deployment
entry point; the previous CI user cannot safely update that entry point itself.
Removing broader existing sudo grants remains necessary. Never infer effective
least privilege from the additive sudoers file alone.

Operator Compose commands must load `/etc/aetherhost/release.env` alongside the
protected production `.env` (for example, use both `--env-file` options). Image
references have no mutable fallback. Do not bypass verification by setting a tag.
