//! # aether-telemetry
//!
//! Standardized OpenTelemetry tracing (Honeycomb/Jaeger) and Prometheus RED metrics
//! for the AetherHost platform services.

pub mod metrics;
pub mod middleware;
pub mod tracing;

pub use metrics::{MetricsRegistry, DEFAULT_LATENCY_BUCKETS};
pub use middleware::{health_handler, prometheus_metrics_handler, telemetry_middleware};
pub use tracing::{init_telemetry, LogFormat, W3cTraceContext};
