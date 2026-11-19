# AetherHost Infrastructure as Code (Terraform)

This directory defines the automated cloud perimeter and supply chain security controls for AetherHost:

- **DNS Management (`dns.tf`)**: Declarative apex, API, console, and preview subdomain routing through Cloudflare CDN/WAF.
- **Edge Firewall (`firewall.tf`)**: Simple user-agent probe filters at the Cloudflare edge. These can be bypassed by changing the user agent and are not a complete WAF policy.
- **GitHub Branch Protection (`github.tf`)**: Strict branch protection for `main`, enforcing green CI checks, review approvals, linear history, and administrator enforcement.

## Prerequisites

- Terraform >= 1.5.0
- Cloudflare API token with `Zone.DNS` and `Zone.WAF` permissions
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
