# Ingress DNS Records managed via Cloudflare

resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  value   = var.server_ip
  type    = "A"
  proxied = true
  comment = "AetherHost primary ingress"
}

resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  value   = var.server_ip
  type    = "A"
  proxied = true
  comment = "AetherHost NestJS Control Plane API"
}

resource "cloudflare_record" "console" {
  zone_id = var.cloudflare_zone_id
  name    = "console"
  value   = var.server_ip
  type    = "A"
  proxied = true
  comment = "AetherHost Next.js Management Console"
}

resource "cloudflare_record" "wildcard_apps" {
  zone_id = var.cloudflare_zone_id
  name    = "*.apps"
  value   = var.server_ip
  type    = "A"
  proxied = true
  comment = "AetherHost dynamic tenant runtime preview subdomains"
}
