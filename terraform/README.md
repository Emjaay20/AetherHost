# AetherHost Infrastructure as Code (Terraform)

This directory defines the automated cloud perimeter and supply chain security controls for AetherHost:

- **DNS (`dns.tf`)**: apex, API, console and wildcard tenant records on Cloudflare, DNS-only (`proxied = false`) to match production, where Traefik terminates TLS.
- **Network exposure (`firewall.tf`)**: documents the public ingress ports. The boundary is enforced on the host by ufw (`deploy/harden-production.sh`); DNS records are DNS-only, so a Cloudflare edge rule would have no effect.
- **GitHub Branch Protection (`github.tf`)**: Strict branch protection for `main`, requiring a pull request and green CI checks, enforced for administrators. Approvals default to 0 for a single maintainer.

## Status

Validated and scanned by Checkov in CI, but **not applied yet**: the live DNS
records and branch protection were created by hand. Import them before the
first apply so it changes nothing unexpectedly, for example:

```bash
terraform -chdir=terraform import 'cloudflare_record.ingress["api"]' <zone_id>/<record_id>
terraform -chdir=terraform import github_branch_protection.main AetherHost:main
terraform -chdir=terraform plan   # expect no changes
```

## Prerequisites

- Terraform >= 1.5.0
- Cloudflare API token with `Zone.DNS` edit permission
- GitHub Personal Access Token (classic with `repo` scope, or fine-grained with Administration permissions)

## Usage

```bash
cd terraform
terraform init
terraform plan
terraform apply
```


The optional [AWS security lab](aws-security-lab/README.md) is a separate Terraform
root and must be initialized/validated/planned independently. No state backend or
cloud resources are applied by repository edits. Protect remote state with locking,
encryption and restricted access. Run reviewed plans periodically to detect drift;
a zero-code diff is not proof of zero infrastructure drift.
