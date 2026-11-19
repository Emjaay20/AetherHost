use aether_router::{build_app, MeterState};
use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    routing::get,
    Router,
};
use tower::ServiceExt;

#[tokio::test]
async fn test_router_allowed_cross_tenant_denial_audit_and_metrics() {
    // 1. Setup mock upstream backend that echoes headers
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let backend_addr = listener.local_addr().unwrap();

    let mock_upstream = Router::new().route(
        "/api/status",
        get(|headers: axum::http::HeaderMap| async move {
            let trace = headers
                .get("traceparent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("none")
                .to_string();

            (
                [(header::HeaderName::from_static("x-echo-traceparent"), trace)],
                "backend-ok\n",
            )
        }),
    );

    tokio::spawn(async move {
        axum::serve(listener, mock_upstream).await.unwrap();
    });

    let backend_url = format!("http://{}", backend_addr);

    // 2. Initialize router state with fresh audit sink
    let mut state = MeterState::new(backend_url, Some("metrics-test-token".into()));
    state.identities = aether_authz::IdentityRegistry::from_json(r#"{"credentials": [{"token": "01234567890123456789012345678901", "subject_id": "service-account-1", "tenant_id": "tenant-alpha", "role": "developer", "expires_at": 4102444800}], "resources": {"myapp": "tenant-alpha", "otherapp": "tenant-beta"}}"#).unwrap();
    let app = build_app(state.clone());

    // 3. Test ALLOWED request: same tenant
    let allowed_req = Request::builder()
        .method("GET")
        .uri("/api/status")
        .header("host", "myapp.aetherhost.internal")
        .header("authorization", "Bearer 01234567890123456789012345678901")
        .header("x-user-id", "usr_dev_1")
        .header("x-tenant-id", "tenant-alpha")
        .header("x-role", "developer")
        .header("x-app-tenant-id", "tenant-alpha")
        .header(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        )
        .body(Body::empty())
        .unwrap();

    let allowed_resp = app.clone().oneshot(allowed_req).await.unwrap();
    assert_eq!(allowed_resp.status(), StatusCode::OK);
    assert_eq!(
        allowed_resp
            .headers()
            .get("x-echo-traceparent")
            .unwrap()
            .to_str()
            .unwrap(),
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "Traceparent was propagated to upstream backend"
    );

    // 4. Test DENIED request: cross-tenant attempt
    let cross_tenant_req = Request::builder()
        .method("GET")
        .uri("/api/status")
        .header("host", "otherapp.aetherhost.internal")
        .header("authorization", "Bearer 01234567890123456789012345678901")
        .header("x-user-id", "usr_attacker")
        .header("x-tenant-id", "tenant-alpha")
        .header("x-role", "developer")
        .header("x-app-tenant-id", "tenant-beta") // Attempting to access tenant-beta's app!
        .body(Body::empty())
        .unwrap();

    let denied_resp = app.clone().oneshot(cross_tenant_req).await.unwrap();
    assert_eq!(denied_resp.status(), StatusCode::FORBIDDEN);

    let body_bytes = axum::body::to_bytes(denied_resp.into_body(), 4096)
        .await
        .unwrap();
    let body_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body_json["error"], "Forbidden");
    assert_eq!(body_json["status"], 403);

    // 5. Verify Audit Records for each evaluation
    let audit_records = state.audit_sink.all();
    assert!(
        audit_records.len() >= 2,
        "Expected at least 2 audit records (allow and deny)"
    );

    let allow_audit = audit_records
        .iter()
        .find(|r| r.tenant_id == "tenant-alpha" && r.decision.is_allowed())
        .expect("Allowed audit record must be recorded");
    assert_eq!(allow_audit.subject_id, "service-account-1");
    assert!(allow_audit.decision.is_allowed());

    let deny_audit = audit_records
        .iter()
        .find(|r| !r.decision.is_allowed())
        .expect("Denied audit record must be recorded");
    assert!(!deny_audit.decision.is_allowed());

    // 6. Verify Prometheus RED Metrics
    let metrics_req = Request::builder()
        .method("GET")
        .uri("/metrics")
        .header("authorization", "Bearer metrics-test-token")
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
        "Prometheus metrics must contain RED request counter"
    );
    assert!(
        metrics_str.contains("status=\"200\""),
        "Must record status 200 in metrics"
    );
    assert!(
        metrics_str.contains("status=\"403\""),
        "Must record status 403 in metrics"
    );
    assert!(
        metrics_str.contains("http_request_duration_seconds"),
        "Must record request duration histogram"
    );
}

#[tokio::test]
async fn forged_headers_without_credentials_cannot_reach_upstream() {
    let app = build_app(MeterState::new("http://127.0.0.1:1".into(), None));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/private")
                .header("host", "myapp.aetherhost.internal")
                .header("x-role", "admin")
                .header("x-tenant-id", "victim")
                .header("x-app-tenant-id", "victim")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
