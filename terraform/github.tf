provider "github" {
  owner = var.github_owner
  token = var.github_token
}

resource "github_branch_protection" "main" {
  repository_id = var.github_repository
  pattern       = "main"

  # checkov:skip=CKV_GIT_6: This GitHub provider resource has no signed-commit
  # setting. Enforce signed commits with a repository ruleset when the GitHub
  # administration credentials are provisioned for a reviewed apply.
  enforce_admins = true

  required_status_checks {
    strict = true
    contexts = [
      "API, Shared Libs & Dashboard",
      "Go Runtime Agent",
      "Rust Crates (aether-core, aether-cli, aether-logd, aether-router)",
      "Security and Dependency Checks",
      "Terraform Security Analysis (Checkov)",
      "Kubernetes KinD & Helm Deployment Validation"
    ]
  }

  # checkov:skip=CKV_GIT_5: GitHub does not let authors approve their own pull
  # requests. With a single maintainer, any required approval combined with
  # enforce_admins blocks every merge; raise the variable when a second
  # reviewer exists. Pull requests and green CI remain mandatory.
  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
    required_approving_review_count = var.required_approving_review_count
  }

  allows_force_pushes = false
  allows_deletions    = false
}
