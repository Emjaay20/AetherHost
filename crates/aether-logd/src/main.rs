use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, RwLock},
};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[derive(Debug, Serialize, Deserialize, Clone)]
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
    chrono_fallback()
}

fn chrono_fallback() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format!("+{}s", d.as_secs()))
        .unwrap_or_else(|_| "0".to_string())
}

#[derive(Clone)]
struct AppState {
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<LogMessage>>>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn get_or_create_sender(&self, app_id: &str) -> broadcast::Sender<LogMessage> {
        let mut map = self.channels.write().unwrap();
        if let Some(sender) = map.get(app_id) {
            sender.clone()
        } else {
            let (tx, _rx) = broadcast::channel(1024);
            map.insert(app_id.to_string(), tx.clone());
            tx
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/ingest", post(ingest_log))
        .route("/ws/:app_id", get(ws_handler))
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "4001".to_string())
        .parse::<u16>()
        .unwrap_or(4001);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("🚀 AetherHost Log Daemon (aether-logd) listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "aether-logd",
        "runtime": "rust",
        "version": "0.1.0"
    }))
}

async fn ingest_log(
    State(state): State<AppState>,
    Json(payload): Json<LogMessage>,
) -> impl IntoResponse {
    let sender = state.get_or_create_sender(&payload.app_id);
    let app_id = payload.app_id.clone();

    match sender.send(payload) {
        Ok(subscribers) => {
            info!("Ingested log for app {} -> {} live subscribers", app_id, subscribers);
            StatusCode::ACCEPTED
        }
        Err(_) => {
            // No active subscribers on channel; still accepted
            StatusCode::ACCEPTED
        }
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(app_id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, app_id, state))
}

async fn handle_socket(socket: WebSocket, app_id: String, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let broadcast_tx = state.get_or_create_sender(&app_id);
    let mut broadcast_rx = broadcast_tx.subscribe();

    info!("Client connected to live log WebSocket for app: {}", app_id);

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json_str.into())).await.is_err() {
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
    };

    info!("Client disconnected from log stream for app: {}", app_id);
}
