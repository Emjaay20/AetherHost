# Ingress DNS records, hosted on Cloudflare.
#
# Records are DNS-only (`proxied = false`) on purpose: Traefik terminates TLS on
# the VPS and obtains certificates with the Let's Encrypt HTTP-01 challenge, so
# clients connect to the origin directly. These definitions mirror what is
# live; import the existing records before the first apply (see README.md).

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  ingress_records = {
    apex          = { name = "@", comment = "AetherHost marketing site and console" }
    api           = { name = "api", comment = "AetherHost control-plane API" }
    console       = { name = "console", comment = "AetherHost management console" }
    wildcard      = { name = "*", comment = "Tenant application subdomains" }
    wildcard_apps = { name = "*.apps", comment = "Tenant preview subdomains" }
  }
}

resource "cloudflare_record" "ingress" {
  for_each = local.ingress_records

  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  value   = var.server_ip
  type    = "A"
  proxied = false
  comment = each.value.comment
}
