use std::collections::HashMap;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Format modes for telemetry logs and traces.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Pretty,
    Json,
}

/// Initializes the global tracing subscriber.
/// Respects `RUST_LOG` environment variable, defaulting to `info`.
pub fn init_telemetry(
    service_name: &str,
    format: LogFormat,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("info,{}=debug", service_name)));

    match format {
        LogFormat::Json => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .json()
                .with_current_span(true)
                .with_span_list(true);

            tracing_subscriber::registry()
                .with(filter)
                .with(fmt_layer)
                .try_init()?;
        }
        LogFormat::Pretty => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_thread_ids(false);

            tracing_subscriber::registry()
                .with(filter)
                .with(fmt_layer)
                .try_init()?;
        }
    }

    Ok(())
}

/// W3C Trace Context representation for Honeycomb/OTel distributed tracing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct W3cTraceContext {
    pub version: String,
    pub trace_id: String,
    pub parent_id: String,
    pub trace_flags: String,
}

impl W3cTraceContext {
    /// Parses a W3C `traceparent` header value (e.g. "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01").
    pub fn parse_traceparent(raw: &str) -> Option<Self> {
        let parts: Vec<&str> = raw.trim().split('-').collect();
        if parts.len() != 4 {
            return None;
        }

        let version = parts[0];
        let trace_id = parts[1];
        let parent_id = parts[2];
        let trace_flags = parts[3];

        if trace_id.len() != 32 || parent_id.len() != 16 {
            return None;
        }

        Some(Self {
            version: version.to_string(),
            trace_id: trace_id.to_string(),
            parent_id: parent_id.to_string(),
            trace_flags: trace_flags.to_string(),
        })
    }

    pub fn to_traceparent_header(&self) -> String {
        format!(
            "{}-{}-{}-{}",
            self.version, self.trace_id, self.parent_id, self.trace_flags
        )
    }

    /// Injects this trace context into an outbound HTTP header map.
    pub fn inject_headers(&self, headers: &mut HashMap<String, String>) {
        headers.insert("traceparent".to_string(), self.to_traceparent_header());
    }
}
