use aether_logd::{build_app, build_cors_layer, AppState, LogMessage};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn test_logd_allowed_cross_tenant_denial_audit_and_metrics() {
    let mut state = AppState::new();
    let cors = build_cors_layer(None);
    state.identities = aether_authz::IdentityRegistry::from_json(r#"{"credentials": [{"token": "01234567890123456789012345678901", "subject_id": "service-account-1", "tenant_id": "tenant-alpha", "role": "developer", "expires_at": 4102444800}], "resources": {"app-alpha-service": "tenant-alpha", "app-beta-secrets": "tenant-beta"}}"#).unwrap();
    let app = build_app(state.clone(), cors);

    // 1. Test ALLOWED ingest: matching tenant
    let allowed_payload = LogMessage {
        app_id: "app-alpha-service".to_string(),
        log: "Database connection pool initialized (size=10)".to_string(),
        level: "info".to_string(),
        timestamp: "+1s".to_string(),
    };

    let allowed_req = Request::builder()
        .method("POST")
        .uri("/ingest")
        .header("content-type", "application/json")
        .header("authorization", "Bearer 01234567890123456789012345678901")
        .header("x-user-id", "service-account-1")
        .header("x-tenant-id", "tenant-alpha")
        .header("x-role", "developer")
        .header("x-app-tenant-id", "tenant-alpha")
        .header(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        )
        .body(Body::from(serde_json::to_vec(&allowed_payload).unwrap()))
        .unwrap();

    let allowed_resp = app.clone().oneshot(allowed_req).await.unwrap();
    assert_eq!(allowed_resp.status(), StatusCode::ACCEPTED);

    // 2. Test DENIED ingest: cross-tenant attempt
    let cross_tenant_payload = LogMessage {
        app_id: "app-beta-secrets".to_string(),
        log: "Attempting to inject rogue log".to_string(),
        level: "warn".to_string(),
        timestamp: "+2s".to_string(),
    };

    let denied_req = Request::builder()
        .method("POST")
        .uri("/ingest")
        .header("content-type", "application/json")
        .header("authorization", "Bearer 01234567890123456789012345678901")
        .header("x-user-id", "rogue-agent")
        .header("x-tenant-id", "tenant-alpha")
        .header("x-role", "admin")
        .header("x-app-tenant-id", "tenant-beta") // Trying to inject into tenant-beta!
        .body(Body::from(
            serde_json::to_vec(&cross_tenant_payload).unwrap(),
        ))
        .unwrap();

    let denied_resp = app.clone().oneshot(denied_req).await.unwrap();
    assert_eq!(denied_resp.status(), StatusCode::FORBIDDEN);

    let body_bytes = axum::body::to_bytes(denied_resp.into_body(), 4096)
        .await
        .unwrap();
    let body_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body_json["error"], "Forbidden");
    assert_eq!(body_json["status"], 403);

    // 3. Verify Audit Records for each evaluation
    let records = state.audit_sink.all();
    assert!(
        records.len() >= 2,
        "Expected at least 2 audit records (allow and deny)"
    );

    let allowed_record = records
        .iter()
        .find(|r| r.tenant_id == "tenant-alpha" && r.decision.is_allowed())
        .expect("Allowed audit record should exist");
    assert_eq!(allowed_record.subject_id, "service-account-1");
    assert_eq!(allowed_record.action.as_str(), "ingest");
    assert!(allowed_record.decision.is_allowed());

    let denied_record = records
        .iter()
        .find(|r| !r.decision.is_allowed())
        .expect("Denied audit record should exist");
    assert_eq!(denied_record.action.as_str(), "ingest");
    assert!(!denied_record.decision.is_allowed());

    // 4. Verify Prometheus RED Metrics
    let metrics_req = Request::builder()
        .method("GET")
        .uri("/metrics")
        .header("authorization", "Bearer 01234567890123456789012345678901")
        .body(Body::empty())
        .unwrap();

    let metrics_resp = app.oneshot(metrics_req).await.unwrap();
    assert_eq!(metrics_resp.status(), StatusCode::OK);

    let metrics_bytes = axum::body::to_bytes(metrics_resp.into_body(), 16384)
        .await
        .unwrap();
    let metrics_str = String::from_utf8(metrics_bytes.to_vec()).unwrap();

    assert!(
        metrics_str.contains("http_requests_total"),
        "Metrics must contain http_requests_total"
    );
    assert!(
        metrics_str.contains("status=\"202\""),
        "Metrics must include status 202 (accepted)"
    );
    assert!(
        metrics_str.contains("status=\"403\""),
        "Metrics must include status 403 (forbidden)"
    );
    assert!(
        metrics_str.contains("http_request_duration_seconds"),
        "Metrics must include duration histogram"
    );
}
