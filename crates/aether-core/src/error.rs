use thiserror::Error;

/// Strongly typed platform error hierarchy for all AetherHost Rust services and clients.
#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Upstream service network failure: {0}")]
    Network(String),

    #[error("Circuit breaker is OPEN for service '{service}'. Fast-failing request (retry after {retry_after_secs}s)")]
    CircuitOpen {
        service: String,
        retry_after_secs: u64,
    },

    #[error("Authentication failed: {0}")]
    Unauthenticated(String),

    #[error("Access denied: {0}")]
    Forbidden(String),

    #[error("Rate limit of {limit} requests exceeded. Resets at {reset_epoch_secs}")]
    RateLimitExceeded { limit: u32, reset_epoch_secs: u64 },

    #[error("Operation timed out after {duration_ms}ms")]
    Timeout { duration_ms: u64 },

    #[error("Serialization / parsing error: {0}")]
    Serialization(String),

    #[error("Internal platform failure: {0}")]
    Internal(String),
}
