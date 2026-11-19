use aether_router::{build_app, MeterState};
use std::net::SocketAddr;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let backend =
        std::env::var("DEFAULT_BACKEND").unwrap_or_else(|_| "http://127.0.0.1:80".to_string());
    let metrics_token = std::env::var("ROUTER_METRICS_TOKEN")
        .ok()
        .or_else(|| std::env::var("AGENT_SECRET_KEY").ok())
        .filter(|t| !t.trim().is_empty());

    let mut state = MeterState::new(backend, metrics_token);
    state.identities = aether_authz::IdentityRegistry::from_env()?;
    let app = build_app(state);

    let port = std::env::var("ROUTER_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(
        "⚡ AetherHost Edge Router & Bandwidth Meter listening on {}",
        addr
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
