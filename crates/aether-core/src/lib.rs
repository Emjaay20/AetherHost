pub mod batch;
pub mod config;
pub mod error;
pub mod resilience;

use serde::{Deserialize, Serialize};
use std::time::Duration;

pub use batch::BatchIngestor;
pub use config::{validate_port, validate_secret, Environment};
pub use error::PlatformError;
pub use resilience::{CircuitBreaker, CircuitState};

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

    #[tokio::test]
    async fn test_circuit_breaker_trips_on_failures() {
        let cb = CircuitBreaker::new("database", 2, Duration::from_millis(50));
        assert_eq!(cb.state(), CircuitState::Closed);

        let r1 = cb.call(|| async { Err::<(), _>("connection refused") }).await;
        assert!(r1.is_err());
        assert_eq!(cb.state(), CircuitState::Closed);

        let r2 = cb.call(|| async { Err::<(), _>("connection refused") }).await;
        assert!(r2.is_err());
        assert_eq!(cb.state(), CircuitState::Open);

        let r3 = cb.call(|| async { Ok::<_, &str>("data") }).await;
        match r3 {
            Err(PlatformError::CircuitOpen { service, .. }) => {
                assert_eq!(service, "database");
            }
            _ => panic!("Expected CircuitOpen error"),
        }
    }

    #[test]
    fn test_config_secret_validation() {
        assert!(validate_secret(
            "AGENT_KEY",
            Some("super-secret-high-entropy-production-key-1234"),
            Environment::Production
        )
        .is_ok());
        assert!(validate_secret("AGENT_KEY", Some("dev-key"), Environment::Production).is_err());
        assert!(validate_secret("AGENT_KEY", None, Environment::Development).is_ok());
    }

    #[tokio::test]
    async fn test_batch_ingestor_count_and_drain() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let flush_counter = std::sync::Arc::new(AtomicUsize::new(0));
        let item_counter = std::sync::Arc::new(AtomicUsize::new(0));

        let fc = flush_counter.clone();
        let ic = item_counter.clone();

        let ingestor = BatchIngestor::new(
            3,
            Duration::from_millis(50),
            100,
            move |batch: Vec<String>| {
                let fc = fc.clone();
                let ic = ic.clone();
                async move {
                    fc.fetch_add(1, Ordering::SeqCst);
                    ic.fetch_add(batch.len(), Ordering::SeqCst);
                }
            },
        );

        // Push 3 items -> triggers count-based flush
        ingestor.push("item1".to_string()).await.unwrap();
        ingestor.push("item2".to_string()).await.unwrap();
        ingestor.push("item3".to_string()).await.unwrap();

        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(flush_counter.load(Ordering::SeqCst), 1);
        assert_eq!(item_counter.load(Ordering::SeqCst), 3);

        // Push 1 item and shutdown -> drain triggers
        ingestor.push("item4".to_string()).await.unwrap();
        ingestor.shutdown().await;

        assert_eq!(flush_counter.load(Ordering::SeqCst), 2);
        assert_eq!(item_counter.load(Ordering::SeqCst), 4);
    }
}
