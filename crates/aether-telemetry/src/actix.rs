use crate::metrics::MetricsRegistry;
use actix_web::{http::header, HttpResponse, Responder};
use std::time::Duration;

/// Helper to record completed Actix-web request telemetry into the metrics registry.
pub fn record_actix_request(
    registry: &MetricsRegistry,
    method: &str,
    path: &str,
    status: u16,
    duration: Duration,
) {
    registry.record_request(method, path, status, duration);
}

/// Standard Actix-web handler for Prometheus exposition endpoint `/_aether/metrics`.
pub async fn actix_prometheus_metrics(registry: actix_web::web::Data<MetricsRegistry>) -> impl Responder {
    let body = registry.render_prometheus();
    HttpResponse::Ok()
        .insert_header((
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        ))
        .body(body)
}
