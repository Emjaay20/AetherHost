use aether_core::{build_http_client, constant_time_eq, extract_app_subdomain};
use axum::{
    body::Bytes,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
    Router,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, RwLock},
};
use tracing::{info, warn};

#[derive(Clone)]
struct MeterState {
    // Maps app_name -> (ingress_bytes, egress_bytes)
    counters: Arc<RwLock<HashMap<String, (u64, u64)>>>,
    default_backend: Arc<String>,
    http_client: reqwest::Client,
    metrics_token: Option<String>,
}

impl MeterState {
    fn new(default_backend: String, metrics_token: Option<String>) -> Self {
        Self {
            counters: Arc::new(RwLock::new(HashMap::new())),
            default_backend: Arc::new(default_backend),
            http_client: build_http_client(30),
            metrics_token,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let backend = std::env::var("DEFAULT_BACKEND")
        .unwrap_or_else(|_| "http://127.0.0.1:80".to_string());
    let metrics_token = std::env::var("ROUTER_METRICS_TOKEN")
        .ok()
        .or_else(|| std::env::var("AGENT_SECRET_KEY").ok())
        .filter(|t| !t.trim().is_empty());

    let state = MeterState::new(backend, metrics_token);

    let app = Router::new()
        .route("/_aether/metrics", get(metrics_handler))
        .route("/_aether/health", get(health_handler))
        .fallback(any(proxy_handler))
        .with_state(state);

    let port = std::env::var("ROUTER_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("⚡ AetherHost Edge Router & Bandwidth Meter listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "aether-router healthy\n")
}

fn is_authorized_for_metrics(headers: &HeaderMap, expected_token: Option<&str>) -> bool {
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

fn format_prometheus_metrics(map: &HashMap<String, (u64, u64)>) -> String {
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

async fn metrics_handler(
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
    let out = format_prometheus_metrics(&map);

    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        out,
    )
        .into_response()
}

async fn proxy_handler(State(state): State<MeterState>, req: Request) -> Response {
    let host = req
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let app_name = extract_app_subdomain(&host);

    let method = req.method().clone();
    let uri = req.uri().clone();
    let path_and_query = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");

    let target_url = format!("{}{}", state.default_backend, path_and_query);

    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => {
            warn!("Failed to read request body: {}", e);
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

    let mut fwd_req = state.http_client.request(method, &target_url);

    for (k, v) in parts.headers.iter() {
        if k != "host" && k != "content-length" {
            fwd_req = fwd_req.header(k.as_str(), v.as_bytes());
        }
    }
    fwd_req = fwd_req.header("Host", host);
    fwd_req = fwd_req.body(body_bytes);

    match fwd_req.send().await {
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

            let mut res = Response::builder().status(status);
            for (k, v) in headers.iter() {
                res = res.header(k.as_str(), v.as_bytes());
            }

            res.body(axum::body::Body::from(resp_bytes))
                .unwrap_or_else(|_| {
                    (StatusCode::INTERNAL_SERVER_ERROR, "Proxy build error").into_response()
                })
        }
        Err(e) => {
            warn!("Proxy forwarding error to {}: {}", target_url, e);
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
