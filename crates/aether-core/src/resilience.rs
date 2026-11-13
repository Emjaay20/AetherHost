use crate::error::PlatformError;
use std::{
    future::Future,
    sync::{
        atomic::{AtomicU32, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

/// A concurrency-safe Circuit Breaker implementing the Michael Nygard pattern.
/// Protects downstream databases and microservices against cascading failures.
#[derive(Clone)]
pub struct CircuitBreaker {
    service_name: Arc<String>,
    failure_threshold: u32,
    recovery_timeout: Duration,
    failure_count: Arc<AtomicU32>,
    success_count: Arc<AtomicU32>,
    last_state_change: Arc<AtomicU64>, // Epoch millis
}

impl CircuitBreaker {
    pub fn new(
        service_name: impl Into<String>,
        failure_threshold: u32,
        recovery_timeout: Duration,
    ) -> Self {
        let now_ms = Instant::now().elapsed().as_millis() as u64;
        Self {
            service_name: Arc::new(service_name.into()),
            failure_threshold,
            recovery_timeout,
            failure_count: Arc::new(AtomicU32::new(0)),
            success_count: Arc::new(AtomicU32::new(0)),
            last_state_change: Arc::new(AtomicU64::new(now_ms)),
        }
    }

    pub fn state(&self) -> CircuitState {
        let failures = self.failure_count.load(Ordering::Relaxed);
        if failures < self.failure_threshold {
            CircuitState::Closed
        } else {
            let last_change_ms = self.last_state_change.load(Ordering::Relaxed);
            let current_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            if current_ms.saturating_sub(last_change_ms) >= self.recovery_timeout.as_millis() as u64
            {
                CircuitState::HalfOpen
            } else {
                CircuitState::Open
            }
        }
    }

    /// Executes an asynchronous operation through the circuit breaker.
    pub async fn call<F, Fut, T, E>(&self, operation: F) -> Result<T, PlatformError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, E>>,
        E: std::fmt::Display,
    {
        match self.state() {
            CircuitState::Open => {
                let remaining_secs = self.recovery_timeout.as_secs();
                Err(PlatformError::CircuitOpen {
                    service: (*self.service_name).clone(),
                    retry_after_secs: remaining_secs,
                })
            }
            CircuitState::Closed | CircuitState::HalfOpen => match operation().await {
                Ok(val) => {
                    self.on_success();
                    Ok(val)
                }
                Err(err) => {
                    self.on_failure();
                    Err(PlatformError::Network(err.to_string()))
                }
            },
        }
    }

    fn on_success(&self) {
        if self.state() == CircuitState::HalfOpen {
            let successes = self.success_count.fetch_add(1, Ordering::Relaxed) + 1;
            if successes >= 2 {
                // Healed! Reset to Closed
                self.reset();
            }
        } else {
            self.failure_count.store(0, Ordering::Relaxed);
        }
    }

    fn on_failure(&self) {
        let failures = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;
        if failures >= self.failure_threshold {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            self.last_state_change.store(now_ms, Ordering::Relaxed);
        }
    }

    pub fn reset(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        self.success_count.store(0, Ordering::Relaxed);
    }
}
