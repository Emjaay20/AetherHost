use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Application {
    pub id: String,
    pub name: String,
    pub runtime: String,
    pub status: String,
    #[serde(rename = "customDomain")]
    pub custom_domain: Option<String>,
    #[serde(rename = "githubRepo")]
    pub github_repo: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct DeploymentLog {
    pub id: String,
    #[serde(rename = "applicationId")]
    pub application_id: String,
    #[serde(rename = "logContent")]
    pub log_content: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AiIterationResult {
    pub summary: Option<String>,
    #[serde(rename = "commitMessage")]
    pub commit_message: Option<String>,
    #[serde(rename = "githubRepo")]
    pub github_repo: Option<String>,
}

/// Builds a shared `reqwest::Client` configured with a timeout.
pub fn build_http_client(timeout_secs: u64) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Constant-time byte comparison for secret tokens.
pub fn constant_time_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    if a_bytes.len() != b_bytes.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a_bytes.iter().zip(b_bytes.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Extracts the tenant application subdomain from a Host header value.
pub fn extract_app_subdomain(host: &str) -> String {
    let without_port = host.split(':').next().unwrap_or("default");
    let first_label = without_port.split('.').next().unwrap_or("default").trim();
    if first_label.is_empty() {
        "default".to_string()
    } else {
        first_label.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq("secret-token-123", "secret-token-123"));
        assert!(!constant_time_eq("secret-token-123", "secret-token-124"));
        assert!(!constant_time_eq("short", "longer-secret"));
    }

    #[test]
    fn test_extract_app_subdomain() {
        assert_eq!(extract_app_subdomain("my-app.aetherhost.dev:8080"), "my-app");
        assert_eq!(extract_app_subdomain("api.localtest.me"), "api");
        assert_eq!(extract_app_subdomain(""), "default");
    }

    #[test]
    fn test_application_deserialization() {
        let raw = r#"{
            "id": "app_1",
            "name": "demo",
            "runtime": "rust",
            "status": "running",
            "customDomain": "demo.example.com"
        }"#;
        let app: Application = serde_json::from_str(raw).expect("valid json");
        assert_eq!(app.id, "app_1");
        assert_eq!(app.runtime, "rust");
        assert_eq!(app.custom_domain.as_deref(), Some("demo.example.com"));
    }
}
