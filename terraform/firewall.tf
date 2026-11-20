# Network exposure
#
# There is deliberately no Cloudflare edge firewall resource here. The DNS
# records in dns.tf are DNS-only, so traffic never passes through Cloudflare's
# proxy and an edge rule would have no effect while reading as a control.
#
# The enforced boundary is the host firewall (ufw) configured by
# deploy/harden-production.sh, plus the bind addresses in
# docker-compose.prod.yml:
#
#   Public inbound
#     80/tcp   Traefik HTTP (redirects to 443, serves ACME HTTP-01)
#     443/tcp  Traefik HTTPS
#     22/tcp   OpenSSH administration
#
#   Loopback or internal Docker networks only
#     5432/tcp PostgreSQL
#     6379/tcp Redis
#     8082/tcp Traefik metrics and health ping
#     2375/tcp Scoped Docker socket proxies
#
# The provider (Contabo) has no Terraform-managed firewall for this VPS. If the
# records are ever switched to proxied, add a `cloudflare_ruleset` in the
# `http_request_firewall_custom` phase here.

output "public_ingress_ports" {
  description = "Ports intentionally reachable from the internet on the production host."
  value       = [22, 80, 443]
}
