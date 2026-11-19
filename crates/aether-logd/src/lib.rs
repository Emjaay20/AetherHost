use aether_authz::{
    Action, AuthzEngine, Decision, Effect, EvaluationContext, IdentityRegistry, InMemoryAuditSink,
    Policy, Resource,
};
use aether_telemetry::{MetricsRegistry, W3cTraceContext};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Instant,
};
use tokio::sync::broadcast;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tracing::info;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LogMessage {
    pub app_id: String,
    pub log: String,
    #[serde(default = "default_level")]
    pub level: String,
    #[serde(default = "default_timestamp")]
    pub timestamp: String,
}

fn default_level() -> String {
    "info".to_string()
}

fn default_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format!("+{}s", d.as_secs()))
        .unwrap_or_else(|_| "0".to_string())
}

#[derive(Clone)]
pub struct AppState {
    pub channels: Arc<RwLock<HashMap<String, broadcast::Sender<LogMessage>>>>,
    pub authz: AuthzEngine,
    pub audit_sink: InMemoryAuditSink,
    pub identities: IdentityRegistry,
    pub telemetry: MetricsRegistry,
}

impl AppState {
    pub fn new() -> Self {
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
            channels: Arc::new(RwLock::new(HashMap::new())),
            authz,
            audit_sink,
            identities: IdentityRegistry::default(),
            telemetry: MetricsRegistry::new("aether-logd"),
        }
    }

    pub fn new_with_engine(
        authz: AuthzEngine,
        audit_sink: InMemoryAuditSink,
        telemetry: MetricsRegistry,
    ) -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            authz,
            audit_sink,
            identities: IdentityRegistry::default(),
            telemetry,
        }
    }

    pub fn get_or_create_sender(&self, app_id: &str) -> broadcast::Sender<LogMessage> {
        let mut map = self
            .channels
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(sender) = map.get(app_id) {
            sender.clone()
        } else {
            let (tx, _rx) = broadcast::channel(1024);
            map.insert(app_id.to_string(), tx.clone());
            tx
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn build_cors_layer(raw_origins: Option<&str>) -> CorsLayer {
    let origins_str = raw_origins.unwrap_or("http://localhost:3002,http://127.0.0.1:3002");
    if origins_str.trim() == "*" {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    let parsed: Vec<HeaderValue> = origins_str
        .split(',')
        .filter_map(|s| HeaderValue::from_str(s.trim()).ok())
        .collect();

    // Invalid origin configuration fails closed instead of enabling every origin.
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(parsed))
        .allow_methods(Any)
        .allow_headers(Any)
}

pub fn build_app(state: AppState, cors: CorsLayer) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/_aether/health", get(health_check))
        .route("/metrics", get(metrics_handler))
        .route("/_aether/metrics", get(metrics_handler))
        .route("/ingest", post(ingest_log))
        .route("/ws/:app_id", get(ws_handler))
        .layer(cors)
        .with_state(state)
}

pub async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "aether-logd",
        "runtime": "rust",
        "version": "0.1.0"
    }))
}

pub async fn metrics_handler(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if state.identities.authenticate(&headers).is_err() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let output = state.telemetry.render_prometheus();
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        output,
    )
        .into_response()
}

pub async fn ingest_log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LogMessage>,
) -> Response {
    let start_time = Instant::now();
    state.telemetry.inc_in_flight();

    // 1. Traceparent parsing
    let _trace_ctx = headers
        .get("traceparent")
        .and_then(|h| h.to_str().ok())
        .and_then(W3cTraceContext::parse_traceparent);

    // 2. Authorization enforcement
    let (subject, target_tenant) = match state.identities.resolve(&headers, &payload.app_id) {
        Ok(identity) => identity,
        Err(status) => {
            state.telemetry.dec_in_flight();
            state.telemetry.record_request(
                "POST",
                "/ingest",
                status.as_u16(),
                start_time.elapsed(),
            );
            return status.into_response();
        }
    };
    let resource = Resource::new("application_logs", &payload.app_id, &target_tenant);
    let action = Action::from("ingest");
    let eval_ctx = EvaluationContext::new(subject, resource, action);

    let decision = state.authz.evaluate(&eval_ctx);
    if let Decision::Deny { reason, .. } = decision {
        state.telemetry.dec_in_flight();
        state.telemetry.record_request(
            "POST",
            "/ingest",
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

    let sender = state.get_or_create_sender(&payload.app_id);
    let app_id = payload.app_id.clone();

    match sender.send(payload) {
        Ok(subscribers) => {
            info!(
                "Ingested log for app {} -> {} live subscribers",
                app_id, subscribers
            );
        }
        Err(_) => {
            // Buffer empty or no active subscribers, still accepted
        }
    }

    state.telemetry.dec_in_flight();
    state.telemetry.record_request(
        "POST",
        "/ingest",
        StatusCode::ACCEPTED.as_u16(),
        start_time.elapsed(),
    );

    StatusCode::ACCEPTED.into_response()
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(app_id): Path<String>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Response {
    let start_time = Instant::now();
    state.telemetry.inc_in_flight();
    let (subject, target_tenant) = match state.identities.resolve(&headers, &app_id) {
        Ok(identity) => identity,
        Err(status) => {
            state.telemetry.dec_in_flight();
            state.telemetry.record_request(
                "GET",
                "/ws/:app_id",
                status.as_u16(),
                start_time.elapsed(),
            );
            return status.into_response();
        }
    };
    let lifetime = match state.identities.session_duration(&headers) {
        Ok(lifetime) => lifetime,
        Err(status) => {
            state.telemetry.dec_in_flight();
            state.telemetry.record_request(
                "GET",
                "/ws/:app_id",
                status.as_u16(),
                start_time.elapsed(),
            );
            return status.into_response();
        }
    };
    let resource = Resource::new("application_logs", &app_id, &target_tenant);
    let action = Action::from("read");
    let eval_ctx = EvaluationContext::new(subject, resource, action);

    let decision = state.authz.evaluate(&eval_ctx);
    if let Decision::Deny { reason, .. } = decision {
        state.telemetry.dec_in_flight();
        state.telemetry.record_request(
            "GET",
            "/ws/:app_id",
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

    state.telemetry.dec_in_flight();
    state.telemetry.record_request(
        "GET",
        "/ws/:app_id",
        StatusCode::SWITCHING_PROTOCOLS.as_u16(),
        start_time.elapsed(),
    );
    ws.on_upgrade(move |socket| handle_socket(socket, app_id, state, lifetime))
}

pub async fn handle_socket(
    socket: WebSocket,
    app_id: String,
    state: AppState,
    lifetime: std::time::Duration,
) {
    let (mut sender, mut receiver) = socket.split();
    let broadcast_tx = state.get_or_create_sender(&app_id);
    let mut broadcast_rx = broadcast_tx.subscribe();

    info!("Client connected to live log WebSocket for app: {}", app_id);

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json_str)).await.is_err() {
                    break;
                }
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
        _ = tokio::time::sleep(lifetime) => {
            send_task.abort();
            recv_task.abort();
        }
    };

    info!("Client disconnected from log stream for app: {}", app_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_message_defaults() {
        let json_str = r#"{"app_id":"app_123","log":"Build succeeded"}"#;
        let msg: LogMessage = serde_json::from_str(json_str).expect("valid log message");
        assert_eq!(msg.app_id, "app_123");
        assert_eq!(msg.log, "Build succeeded");
        assert_eq!(msg.level, "info");
        assert!(!msg.timestamp.is_empty());
    }

    #[tokio::test]
    async fn test_app_state_broadcast_channel() {
        let state = AppState::new();
        let tx = state.get_or_create_sender("app_test");
        let mut rx = tx.subscribe();

        let payload = LogMessage {
            app_id: "app_test".to_string(),
            log: "Container listening on 3000".to_string(),
            level: "info".to_string(),
            timestamp: "+10s".to_string(),
        };

        tx.send(payload.clone()).expect("broadcast send");
        let received = rx.recv().await.expect("broadcast recv");
        assert_eq!(received, payload);
    }
}
