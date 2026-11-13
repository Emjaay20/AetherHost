//! # aether-telemetry
//!
//! Standardized OpenTelemetry tracing (Honeycomb/Jaeger) and Prometheus RED metrics
//! for the AetherHost platform services.

pub mod actix;
pub mod metrics;
pub mod middleware;
pub mod tracing;

pub use actix::{actix_prometheus_metrics, record_actix_request};
pub use metrics::{MetricsRegistry, DEFAULT_LATENCY_BUCKETS};
pub use middleware::{health_handler, prometheus_metrics_handler, telemetry_middleware};
pub use tracing::{init_telemetry, LogFormat, W3cTraceContext};
