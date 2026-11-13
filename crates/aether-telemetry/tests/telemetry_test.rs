use aether_telemetry::{
    metrics::MetricsRegistry,
    middleware::{prometheus_metrics_handler, telemetry_middleware},
    tracing::W3cTraceContext,
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    middleware,
    routing::get,
    Router,
};
use std::time::Duration;
use tower::ServiceExt;

#[test]
fn test_w3c_traceparent_parsing_and_injection() {
    let raw = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    let parsed = W3cTraceContext::parse_traceparent(raw).expect("valid traceparent");

    assert_eq!(parsed.version, "00");
    assert_eq!(parsed.trace_id, "4bf92f3577b34da6a3ce929d0e0e4736");
    assert_eq!(parsed.parent_id, "00f067aa0ba902b7");
    assert_eq!(parsed.trace_flags, "01");
    assert_eq!(parsed.to_traceparent_header(), raw);

    // Invalid formats should return None
    assert!(W3cTraceContext::parse_traceparent("invalid-header").is_none());
    assert!(W3cTraceContext::parse_traceparent("00-short-short-01").is_none());
}

#[test]
fn test_metrics_registry_records_and_renders_prometheus() {
    let registry = MetricsRegistry::new("test-service");

    registry.record_request("GET", "/api/v1/projects", 200, Duration::from_millis(45));
    registry.record_request("GET", "/api/v1/projects", 200, Duration::from_millis(120));
    registry.record_request("POST", "/api/v1/deploy", 500, Duration::from_millis(850));

    let output = registry.render_prometheus();

    assert!(output.contains(
        "http_requests_total{service=\"test-service\",method=\"GET\",route=\"/api/v1/projects\",status=\"200\"} 2"
    ));
    assert!(output.contains(
        "http_requests_total{service=\"test-service\",method=\"POST\",route=\"/api/v1/deploy\",status=\"500\"} 1"
    ));
    assert!(output.contains("http_request_duration_seconds_bucket"));
    assert!(output.contains("http_requests_in_flight{service=\"test-service\"} 0"));
}

#[tokio::test]
async fn test_axum_telemetry_middleware_integration() {
    let registry = MetricsRegistry::new("api-monolith");

    let app = Router::new()
        .route(
            "/api/test",
            get(|| async { (StatusCode::OK, "hello platform") }),
        )
        .route("/metrics", get(prometheus_metrics_handler))
        .layer(middleware::from_fn_with_state(
            registry.clone(),
            telemetry_middleware,
        ))
        .with_state(registry.clone());

    // Send a mock request to /api/test
    let req = Request::builder()
        .uri("/api/test")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Verify metrics collected
    let metrics_output = registry.render_prometheus();
    assert!(metrics_output.contains("method=\"GET\",route=\"/api/test\",status=\"200\""));
}

#[tokio::test]
async fn test_actix_telemetry_handler() {
    use aether_telemetry::record_actix_request;

    let registry = MetricsRegistry::new("actix-monolith");
    record_actix_request(
        &registry,
        "POST",
        "/api/quotes/quote_1/approve",
        200,
        Duration::from_millis(15),
    );

    let output = registry.render_prometheus();
    assert!(output.contains("http_requests_total{service=\"actix-monolith\",method=\"POST\",route=\"/api/quotes/quote_1/approve\",status=\"200\"} 1"));
}
