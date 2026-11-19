use actix_web::{
    get,
    test::{call_service, init_service, read_body, read_body_json, TestRequest},
    web, App, HttpResponse, Responder,
};
use aether_authz::{
    AuthenticatedSubject, AuthzEngine, AuthzMiddleware, Effect, InMemoryAuditSink, Policy,
};
use aether_telemetry::{actix_prometheus_metrics, ActixTelemetryMiddleware, MetricsRegistry};
use serde_json::Value;
use std::sync::Arc;

#[get("/api/v1/workloads")]
async fn get_workloads(subject: AuthenticatedSubject) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "caller_id": subject.subject.id,
        "tenant_id": subject.subject.tenant_id,
        "roles": subject.subject.roles
    }))
}

#[actix_web::test]
async fn test_actix_middleware_allow_deny_and_telemetry() {
    let audit_sink = InMemoryAuditSink::new(100);
    let engine = Arc::new(
        AuthzEngine::builder()
            .with_audit_sink(Arc::new(audit_sink.clone()))
            .with_role_inheritance("admin", "developer")
            .with_policy(
                Policy::builder("tenant_boundary", Effect::Allow)
                    .name("Tenant Boundary Isolation")
                    .role("developer")
                    .any_resource()
                    .any_action()
                    .same_tenant()
                    .build(),
            )
            .with_policy(
                Policy::builder("admin_override", Effect::Allow)
                    .name("Admin Full Platform Access")
                    .role("admin")
                    .any_resource()
                    .any_action()
                    .build(),
            )
            .build(),
    );

    let metrics = Arc::new(MetricsRegistry::new("actix-monolith-test"));

    let engine_clone = engine.clone();
    let metrics_clone = metrics.clone();

    let app = init_service(
        App::new()
            .app_data(web::Data::new(aether_authz::IdentityRegistry::from_json(r#"{"credentials":[{"token":"01234567890123456789012345678901","subject_id":"usr_dev_42","tenant_id":"tenant-alpha","role":"developer","expires_at":4102444800}],"resources":{"/api/v1/workloads":"tenant-alpha","/api/v1/foreign-workloads":"tenant-bravo","/metrics":"tenant-alpha"}}"#).unwrap()))
            .app_data(web::Data::from(metrics.clone()))
            .wrap(AuthzMiddleware::new(engine_clone))
            .wrap(ActixTelemetryMiddleware::new(metrics_clone))
            .route("/metrics", web::get().to(actix_prometheus_metrics))
            .service(get_workloads),
    )
    .await;

    // 1. ALLOWED Request: Same tenant developer
    let allow_req = TestRequest::get()
        .uri("/api/v1/workloads")
        .insert_header(("authorization", "Bearer 01234567890123456789012345678901"))
        .insert_header(("x-user-id", "usr_dev_42"))
        .insert_header(("x-tenant-id", "tenant-alpha"))
        .insert_header(("x-role", "developer"))
        .insert_header(("x-app-tenant-id", "tenant-alpha"))
        .insert_header((
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        ))
        .to_request();

    let allow_resp = call_service(&app, allow_req).await;
    assert_eq!(allow_resp.status(), 200);

    // Verify traceparent header propagated in response
    let response_trace = allow_resp
        .headers()
        .get("traceparent")
        .and_then(|v| v.to_str().ok());
    assert_eq!(
        response_trace,
        Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
    );

    // Verify AuthenticatedSubject extractor payload
    let allow_json: Value = read_body_json(allow_resp).await;
    assert_eq!(allow_json["caller_id"], "usr_dev_42");
    assert_eq!(allow_json["tenant_id"], "tenant-alpha");

    // 2. DENIED Request: Cross-tenant unauthorized attempt
    let deny_req = TestRequest::get()
        .uri("/api/v1/foreign-workloads")
        .insert_header(("authorization", "Bearer 01234567890123456789012345678901"))
        .insert_header(("x-user-id", "usr_rogue"))
        .insert_header(("x-tenant-id", "tenant-alpha"))
        .insert_header(("x-role", "developer"))
        .insert_header(("x-app-tenant-id", "tenant-bravo")) // Cross-tenant boundary violation!
        .to_request();

    let deny_resp = call_service(&app, deny_req).await;
    assert_eq!(deny_resp.status(), 403);

    let deny_json: Value = read_body_json(deny_resp).await;
    assert_eq!(deny_json["error"], "Forbidden");
    assert_eq!(deny_json["status"], 403);

    // 3. Verify Audit Sink recorded both evaluations
    let records = audit_sink.all();
    assert!(records.len() >= 2);
    let allowed_rec = records.iter().find(|r| r.decision.is_allowed()).unwrap();
    assert_eq!(allowed_rec.subject_id, "usr_dev_42");

    let denied_rec = records.iter().find(|r| !r.decision.is_allowed()).unwrap();
    assert_eq!(denied_rec.subject_id, "usr_dev_42");

    // 4. Verify Prometheus RED Metrics
    let metrics_req = TestRequest::get()
        .uri("/metrics")
        .insert_header(("authorization", "Bearer 01234567890123456789012345678901"))
        .to_request();
    let metrics_resp = call_service(&app, metrics_req).await;
    assert_eq!(metrics_resp.status(), 200);

    let metrics_body = read_body(metrics_resp).await;
    let metrics_str = String::from_utf8(metrics_body.to_vec()).unwrap();

    assert!(metrics_str.contains("http_requests_total"));
    assert!(metrics_str.contains("status=\"200\""));
    assert!(metrics_str.contains("status=\"403\""));
    assert!(metrics_str.contains("http_request_duration_seconds"));
}
