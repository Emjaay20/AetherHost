variable "region" {
  type    = string
  default = "eu-west-1"
}
variable "name" {
  type    = string
  default = "aether-security-lab"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,25}$", var.name))
    error_message = "Use a lowercase resource prefix of 3–26 letters, numbers and hyphens."
  }
}
variable "github_repository" {
  type    = string
  default = "Emjaay20/AetherHost"
}
variable "github_oidc_provider_arn" {
  type        = string
  description = "Existing account OIDC provider for token.actions.githubusercontent.com; no long-lived CI keys."
}
variable "enable_guardduty" {
  type        = bool
  default     = false
  description = "Enable only after reviewing AWS costs and existing account configuration."
}
