# AetherHost Infrastructure as Code (Terraform)

This directory defines the automated cloud perimeter and supply chain security controls for AetherHost:

- **DNS Management (`dns.tf`)**: Declarative apex, API, console, and preview subdomain routing through Cloudflare CDN/WAF.
- **Edge Firewall (`firewall.tf`)**: Automated blocking of vulnerability scanning bots and hostile reconnaissance at the Cloudflare edge.
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
