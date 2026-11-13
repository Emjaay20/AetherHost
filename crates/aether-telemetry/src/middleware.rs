use crate::metrics::MetricsRegistry;
use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::time::Instant;
use tracing::{info_span, Instrument};

/// Axum middleware function that instruments incoming requests with RED metrics and tracing.
pub async fn telemetry_middleware(
    State(metrics): State<MetricsRegistry>,
    req: Request,
    next: Next,
) -> Response {
    let start = Instant::now();
    let method = req.method().to_string();
    let path = req.uri().path().to_string();

    metrics.inc_in_flight();

    let span = info_span!(
        "http_request",
        method = %method,
        path = %path,
    );

    let response = next.run(req).instrument(span).await;

    metrics.dec_in_flight();
    let duration = start.elapsed();
    let status = response.status().as_u16();

    metrics.record_request(&method, &path, status, duration);

    response
}

/// Handler for the `/metrics` endpoint that serves Prometheus exposition format.
pub async fn prometheus_metrics_handler(
    State(metrics): State<MetricsRegistry>,
) -> impl IntoResponse {
    let output = metrics.render_prometheus();
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; version=0.0.4"),
        )],
        output,
    )
}

/// Handler for the standard liveness and readiness probe endpoint `/_health`.
pub async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "OK\n")
}
