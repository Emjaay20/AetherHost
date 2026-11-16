use aether_authz::{
    Action, AuthzEngine, Decision, Effect, EvaluationContext, InMemoryAuditSink, Policy, Resource,
    Subject,
};
use aether_core::{
    build_http_client, constant_time_eq, extract_app_subdomain, CircuitBreaker, PlatformError,
};
use aether_telemetry::{MetricsRegistry, W3cTraceContext};
use axum::{
    body::Bytes,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
    Json, Router,
};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Instant,
};
use tracing::warn;

#[derive(Clone)]
pub struct MeterState {
    // Maps app_name -> (ingress_bytes, egress_bytes)
    pub counters: Arc<RwLock<HashMap<String, (u64, u64)>>>,
    pub default_backend: Arc<String>,
    pub http_client: reqwest::Client,
    pub metrics_token: Option<String>,
    pub circuit_breaker: CircuitBreaker,
    pub telemetry: MetricsRegistry,
    pub authz: AuthzEngine,
    pub audit_sink: InMemoryAuditSink,
}

impl MeterState {
    pub fn new(default_backend: String, metrics_token: Option<String>) -> Self {
        let audit_sink = InMemoryAuditSink::new(1000);
        let authz = AuthzEngine::builder()
            .with_audit_sink(Arc::new(audit_sink.clone()))
            .with_policy(
                Policy::builder("tenant_isolation", Effect::Allow)
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
            .build();

        Self {
            counters: Arc::new(RwLock::new(HashMap::new())),
            default_backend: Arc::new(default_backend),
            http_client: build_http_client(30),
            metrics_token,
            circuit_breaker: CircuitBreaker::new(
                "edge-upstream-backend",
                5,
                std::time::Duration::from_secs(10),
            ),
            telemetry: MetricsRegistry::new("aether-router"),
            authz,
            audit_sink,
        }
    }

    pub fn new_with_engine(
        default_backend: String,
        metrics_token: Option<String>,
        authz: AuthzEngine,
        audit_sink: InMemoryAuditSink,
        telemetry: MetricsRegistry,
    ) -> Self {
        Self {
            counters: Arc::new(RwLock::new(HashMap::new())),
            default_backend: Arc::new(default_backend),
            http_client: build_http_client(30),
            metrics_token,
            circuit_breaker: CircuitBreaker::new(
                "edge-upstream-backend",
                5,
                std::time::Duration::from_secs(10),
            ),
            telemetry,
            authz,
            audit_sink,
        }
    }
}

pub fn build_app(state: MeterState) -> Router {
    Router::new()
        .route("/_aether/metrics", get(metrics_handler))
        .route("/metrics", get(metrics_handler))
        .route("/_aether/health", get(health_handler))
        .fallback(any(proxy_handler))
        .with_state(state)
}

pub async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "aether-router healthy\n")
}

pub fn is_authorized_for_metrics(headers: &HeaderMap, expected_token: Option<&str>) -> bool {
    let Some(expected) = expected_token else {
        return true;
    };
    if let Some(agent_key) = headers.get("x-agent-key").and_then(|v| v.to_str().ok()) {
        if constant_time_eq(agent_key, expected) {
            return true;
        }
    }
    if let Some(auth) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(bearer) = auth.strip_prefix("Bearer ") {
            if constant_time_eq(bearer.trim(), expected) {
                return true;
            }
        }
    }
    false
}

pub fn format_prometheus_metrics(map: &HashMap<String, (u64, u64)>) -> String {
    let mut out = String::from(
        "# HELP aether_bandwidth_bytes_total Bandwidth bytes processed by AetherHost Edge\n# TYPE aether_bandwidth_bytes_total counter\n",
    );

    let mut keys: Vec<&String> = map.keys().collect();
    keys.sort();

    for app in keys {
        if let Some((ingress, egress)) = map.get(app) {
            out.push_str(&format!(
                "aether_bandwidth_bytes_total{{app=\"{}\",direction=\"ingress\"}} {}\n",
                app, ingress
            ));
            out.push_str(&format!(
                "aether_bandwidth_bytes_total{{app=\"{}\",direction=\"egress\"}} {}\n",
                app, egress
            ));
        }
    }
    out
}

pub async fn metrics_handler(
    State(state): State<MeterState>,
    headers: HeaderMap,
) -> Response {
    if !is_authorized_for_metrics(&headers, state.metrics_token.as_deref()) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized metrics access\n").into_response();
    }

    let map = state
        .counters
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut out = format_prometheus_metrics(&map);
    out.push('\n');
    out.push_str(&state.telemetry.render_prometheus());

    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        out,
    )
        .into_response()
}

pub async fn proxy_handler(State(state): State<MeterState>, req: Request) -> Response {
    let start_time = Instant::now();
    state.telemetry.inc_in_flight();

    let host = req
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let app_name = extract_app_subdomain(&host);
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path_and_query = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/").to_string();

    let (parts, body) = req.into_parts();

    // 1. Enforce Authorization via AuthzEngine
    let subject_id = parts
        .headers
        .get("x-user-id")
        .or_else(|| parts.headers.get("x-subject-id"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("anonymous");

    let subject_tenant = parts
        .headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("default");

    let subject_role = parts
        .headers
        .get("x-actor-role")
        .or_else(|| parts.headers.get("x-role"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("developer");

    let resource_tenant = parts
        .headers
        .get("x-app-tenant-id")
        .or_else(|| parts.headers.get("x-target-tenant"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("default");

    let subject = Subject::new(subject_id, subject_tenant).with_role(subject_role);
    let resource = Resource::new("application", &app_name, resource_tenant);
    let action = Action::from(method.as_str());
    let eval_ctx = EvaluationContext::new(subject, resource, action);

    let decision = state.authz.evaluate(&eval_ctx);
    if let Decision::Deny { reason, .. } = decision {
        state.telemetry.dec_in_flight();
        state.telemetry.record_request(
            method.as_str(),
            &path_and_query,
            StatusCode::FORBIDDEN.as_u16(),
            start_time.elapsed(),
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Forbidden",
                "reason": reason,
                "status": 403
            })),
        )
            .into_response();
    }

    // 2. Traceparent context resolution & propagation
    let traceparent_header = parts
        .headers
        .get("traceparent")
        .and_then(|h| h.to_str().ok())
        .and_then(W3cTraceContext::parse_traceparent)
        .map(|tc| tc.to_traceparent_header())
        .unwrap_or_else(|| {
            // Generate standard W3C traceparent (version 00, 16-byte hex trace_id, 8-byte hex parent_id)
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let trace_id = format!("{:032x}", now);
            let parent_id = format!("{:016x}", (now as u64) ^ 0x5a5a5a5a5a5a5a5a);
            format!("00-{}-{}-01", trace_id, parent_id)
        });

    let target_url = format!("{}{}", state.default_backend, path_and_query);

    let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => {
            warn!("Failed to read request body: {}", e);
            state.telemetry.dec_in_flight();
            state.telemetry.record_request(
                method.as_str(),
                &path_and_query,
                StatusCode::BAD_REQUEST.as_u16(),
                start_time.elapsed(),
            );
            return (StatusCode::BAD_REQUEST, "Payload too large or corrupted").into_response();
        }
    };

    let ingress_len = body_bytes.len() as u64;

    // Record ingress bytes
    {
        let mut map = state
            .counters
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let entry = map.entry(app_name.clone()).or_insert((0, 0));
        entry.0 += ingress_len;
    }

    let mut fwd_req = state.http_client.request(method.clone(), &target_url);

    for (k, v) in parts.headers.iter() {
        if k != "host" && k != "content-length" && k != "traceparent" {
            fwd_req = fwd_req.header(k.as_str(), v.as_bytes());
        }
    }
    fwd_req = fwd_req.header("Host", host);
    fwd_req = fwd_req.header("traceparent", traceparent_header);
    fwd_req = fwd_req.body(body_bytes);

    let target_url_clone = target_url.clone();
    let send_result = state
        .circuit_breaker
        .call(|| async { fwd_req.send().await })
        .await;

    state.telemetry.dec_in_flight();

    match send_result {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16())
                .unwrap_or(StatusCode::BAD_GATEWAY);
            let headers = resp.headers().clone();
            let resp_bytes = resp.bytes().await.unwrap_or_else(|_| Bytes::new());
            let egress_len = resp_bytes.len() as u64;

            // Record egress bytes
            {
                let mut map = state
                    .counters
                    .write()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let entry = map.entry(app_name).or_insert((0, 0));
                entry.1 += egress_len;
            }

            state.telemetry.record_request(
                method.as_str(),
                &path_and_query,
                status.as_u16(),
                start_time.elapsed(),
            );

            let mut res = Response::builder().status(status);
            for (k, v) in headers.iter() {
                res = res.header(k.as_str(), v.as_bytes());
            }

            res.body(axum::body::Body::from(resp_bytes))
                .unwrap_or_else(|_| {
                    (StatusCode::INTERNAL_SERVER_ERROR, "Proxy build error").into_response()
                })
        }
        Err(PlatformError::CircuitOpen {
            service,
            retry_after_secs,
        }) => {
            warn!(
                "Circuit breaker tripped for {}: retry after {}s",
                service, retry_after_secs
            );
            state.telemetry.record_request(
                method.as_str(),
                &path_and_query,
                StatusCode::SERVICE_UNAVAILABLE.as_u16(),
                start_time.elapsed(),
            );
            (
                StatusCode::SERVICE_UNAVAILABLE,
                format!(
                    "Service Unavailable: Upstream circuit breaker open. Retry after {}s",
                    retry_after_secs
                ),
            )
                .into_response()
        }
        Err(e) => {
            warn!("Proxy forwarding error to {}: {}", target_url_clone, e);
            state.telemetry.record_request(
                method.as_str(),
                &path_and_query,
                StatusCode::BAD_GATEWAY.as_u16(),
                start_time.elapsed(),
            );
            (StatusCode::BAD_GATEWAY, format!("Bad Gateway: {}", e)).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn test_format_prometheus_metrics() {
        let mut map = HashMap::new();
        map.insert("my-app".to_string(), (1024, 4096));
        let output = format_prometheus_metrics(&map);
        assert!(output.contains("aether_bandwidth_bytes_total{app=\"my-app\",direction=\"ingress\"} 1024"));
        assert!(output.contains("aether_bandwidth_bytes_total{app=\"my-app\",direction=\"egress\"} 4096"));
    }

    #[test]
    fn test_metrics_authorization() {
        let mut headers = HeaderMap::new();
        assert!(is_authorized_for_metrics(&headers, None));
        assert!(!is_authorized_for_metrics(&headers, Some("secret-123")));

        headers.insert("x-agent-key", HeaderValue::from_static("secret-123"));
        assert!(is_authorized_for_metrics(&headers, Some("secret-123")));
        assert!(!is_authorized_for_metrics(&headers, Some("wrong-secret")));
    }
}
