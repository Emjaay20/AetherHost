use actix_web::{get, web, App, HttpResponse, HttpServer, Responder};
use aether_authz::{
    AuthenticatedSubject, AuthzEngine, AuthzMiddleware, Effect, InMemoryAuditSink, Policy,
};
use aether_telemetry::{actix_prometheus_metrics, ActixTelemetryMiddleware, MetricsRegistry};
use std::sync::Arc;

#[get("/health")]
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "aether-actix-monolith",
        "runtime": "actix-web-4"
    }))
}

#[get("/api/v1/workloads")]
async fn get_workloads(subject: AuthenticatedSubject) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "caller_id": subject.subject.id,
        "tenant_id": subject.subject.tenant_id,
        "roles": subject.subject.roles,
        "workloads": ["monolith-core", "authz-service", "telemetry-worker"]
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    aether_telemetry::init_telemetry("actix-monolith", aether_telemetry::LogFormat::Pretty).ok();

    let audit_sink = InMemoryAuditSink::new(1000);
    let engine = Arc::new(
        AuthzEngine::builder()
            .with_audit_sink(Arc::new(audit_sink))
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
                    .name("Platform Admin Global Access")
                    .role("admin")
                    .any_resource()
                    .any_action()
                    .build(),
            )
            .build(),
    );

    let identities = aether_authz::IdentityRegistry::from_env()
        .map_err(|_| std::io::Error::other("Configure AETHER_IDENTITY_CONFIG_FILE"))?;
    let metrics = Arc::new(MetricsRegistry::new("aether-actix-monolith"));

    let bind_addr = "127.0.0.1:8088";
    println!(
        "⚡ Actix Monolith Example listening on http://{}",
        bind_addr
    );
    println!("   Endpoints:");
    println!("     GET  /health");
    println!("     GET  /metrics");
    println!("     GET  /api/v1/workloads");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(identities.clone()))
            .app_data(web::Data::from(metrics.clone()))
            .wrap(AuthzMiddleware::new(engine.clone()))
            .wrap(ActixTelemetryMiddleware::new(metrics.clone()))
            .service(health_check)
            .route("/metrics", web::get().to(actix_prometheus_metrics))
            .service(get_workloads)
    })
    .bind(bind_addr)?
    .run()
    .await
}
