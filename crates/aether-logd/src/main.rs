use aether_logd::{build_app, build_cors_layer, AppState};
use std::net::SocketAddr;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let state = AppState::new();
    let cors_env = std::env::var("CORS_ORIGIN").ok();
    let cors = build_cors_layer(cors_env.as_deref());

    let app = build_app(state, cors);

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
