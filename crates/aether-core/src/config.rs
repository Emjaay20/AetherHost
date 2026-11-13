use crate::error::PlatformError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Development,
    Staging,
    Production,
}

impl Environment {
    pub fn is_production(&self) -> bool {
        matches!(self, Environment::Production)
    }
}

impl Default for Environment {
    fn default() -> Self {
        match std::env::var("NODE_ENV")
            .or_else(|_| std::env::var("ENVIRONMENT"))
            .unwrap_or_default()
            .to_lowercase()
            .as_str()
        {
            "production" | "prod" => Environment::Production,
            "staging" | "stage" => Environment::Staging,
            _ => Environment::Development,
        }
    }
}

/// Validates that a port number is within valid unprivileged/privileged ranges.
pub fn validate_port(port: u16) -> Result<u16, PlatformError> {
    if port == 0 {
        return Err(PlatformError::Config("Port number cannot be 0".to_string()));
    }
    Ok(port)
}

/// Ensures critical secret tokens are not left with default or empty values in production.
pub fn validate_secret(
    name: &str,
    value: Option<&str>,
    env: Environment,
) -> Result<String, PlatformError> {
    match value {
        Some(v) if !v.trim().is_empty() => {
            if env.is_production() && (v.contains("dev") || v.contains("test") || v.len() < 16) {
                return Err(PlatformError::Config(format!(
                    "Secret '{}' appears weak or insecure for production use",
                    name
                )));
            }
            Ok(v.trim().to_string())
        }
        _ => {
            if env.is_production() {
                Err(PlatformError::Config(format!(
                    "Required secret '{}' is missing in production environment",
                    name
                )))
            } else {
                Ok("dev-fallback-secret-not-for-prod".to_string())
            }
        }
    }
}
