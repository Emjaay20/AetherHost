terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.2.0"
    }
  }
}
