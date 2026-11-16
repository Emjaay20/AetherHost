# Edge Firewall & Ingress Protection

resource "cloudflare_filter" "block_bad_bots" {
  zone_id     = var.cloudflare_zone_id
  description = "Block common automated reconnaissance probes"
  expression  = "(http.user_agent contains \"sqlmap\" or http.user_agent contains \"nikto\" or http.user_agent contains \"masscan\" or http.user_agent contains \"dirbuster\")"
}

resource "cloudflare_firewall_rule" "block_bad_bots" {
  zone_id     = var.cloudflare_zone_id
  description = "Enforce blocking for automated security reconnaissance probes"
  filter_id   = cloudflare_filter.block_bad_bots.id
  action      = "block"
}

# Production Host Ingress Matrix Documentation:
# Allowed Public Inbound:
#   - Port 80/tcp: Traefik HTTP Ingress (Redirects to 443)
#   - Port 443/tcp: Traefik HTTPS Ingress (TLS terminated via Let's Encrypt)
#   - Port 22/tcp: OpenSSH Server Management
# Internal Only (Bound to 127.0.0.1 or bridge networks):
#   - Port 5432/tcp: PostgreSQL DB (control-plane-net)
#   - Port 6379/tcp: Redis Key-Value Store (control-plane-net)
#   - Port 8082/tcp: Traefik Prometheus metrics & health ping (127.0.0.1 only)
#   - Port 2375/tcp: Scoped Docker socket proxy (control-plane-net)
