variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token with Zone.DNS and Zone.WAF edit permissions"
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare Zone ID for the target domain"
}

variable "domain_name" {
  type        = string
  description = "Base production domain name"
  default     = "aetherhost.app"
}

variable "server_ip" {
  type        = string
  description = "Public IPv4 address of the production server"
  default     = "194.163.172.101"
}

variable "github_token" {
  type        = string
  description = "GitHub Personal Access Token with repo administration rights"
  sensitive   = true
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user account owner"
  default     = "Emjaay20"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository name"
  default     = "AetherHost"
}
