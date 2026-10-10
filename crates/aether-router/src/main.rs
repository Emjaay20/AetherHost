use axum::{
    body::Bytes,
    extract::{Request, State},
    http::StatusCode,
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

#[derive(Clone, Default)]
struct MeterState {
    // Maps app_name -> (ingress_bytes, egress_bytes)
    counters: Arc<RwLock<HashMap<String, (u64, u64)>>>,
    default_backend: Arc<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let backend = std::env::var("DEFAULT_BACKEND").unwrap_or_else(|_| "http://127.0.0.1:80".to_string());
    let state = MeterState {
        counters: Arc::new(RwLock::new(HashMap::new())),
        default_backend: Arc::new(backend),
    };

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

async fn metrics_handler(State(state): State<MeterState>) -> impl IntoResponse {
    let map = state.counters.read().unwrap();
    let mut out = String::from("# HELP aether_bandwidth_bytes_total Bandwidth bytes processed by AetherHost Edge\n# TYPE aether_bandwidth_bytes_total counter\n");

    for (app, (ingress, egress)) in map.iter() {
        out.push_str(&format!(
            "aether_bandwidth_bytes_total{{app=\"{}\",direction=\"ingress\"}} {}\n",
            app, ingress
        ));
        out.push_str(&format!(
            "aether_bandwidth_bytes_total{{app=\"{}\",direction=\"egress\"}} {}\n",
            app, egress
        ));
    }

    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        out,
    )
}

async fn proxy_handler(State(state): State<MeterState>, req: Request) -> Response {
    let host = req
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let app_name = host.split('.').next().unwrap_or("default").to_string();

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
        let mut map = state.counters.write().unwrap();
        let entry = map.entry(app_name.clone()).or_insert((0, 0));
        entry.0 += ingress_len;
    }

    let client = reqwest::Client::new();
    let mut fwd_req = client.request(method, &target_url);

    for (k, v) in parts.headers.iter() {
        if k != "host" && k != "content-length" {
            fwd_req = fwd_req.header(k.as_str(), v.as_bytes());
        }
    }
    fwd_req = fwd_req.header("Host", host);
    fwd_req = fwd_req.body(body_bytes);

    match fwd_req.send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let headers = resp.headers().clone();
            let resp_bytes = resp.bytes().await.unwrap_or_else(|_| Bytes::new());
            let egress_len = resp_bytes.len() as u64;

            // Record egress bytes
            {
                let mut map = state.counters.write().unwrap();
                let entry = map.entry(app_name).or_insert((0, 0));
                entry.1 += egress_len;
            }

            let mut res = Response::builder().status(status);
            for (k, v) in headers.iter() {
                res = res.header(k.as_str(), v.as_bytes());
            }

            res.body(axum::body::Body::from(resp_bytes))
                .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Proxy build error").into_response())
        }
        Err(e) => {
            warn!("Proxy forwarding error to {}: {}", target_url, e);
            (StatusCode::BAD_GATEWAY, format!("Bad Gateway: {}", e)).into_response()
        }
    }
}
