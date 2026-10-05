mod build_tracker;
mod config;
mod error;
mod log;
mod middlewares;
mod program;
mod routes;
// mod test_bip322;  // Commented out - missing dependencies (arch_sdk, bitcoin, etc.)

use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Result;
use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use tokio::net::TcpListener;
use tracing::{info, error};
use socket2::{Socket, Domain, Type};

use self::{build_tracker::BuildTracker, config::Config, log::init_logging, middlewares::*, routes::*};

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env();
    init_logging(config.verbose);
    info!("Config loaded: {config:#?}");

    program::init().await.map_err(|e| {
        error!("Failed to initialize program directory: {}", e);
        e
    })?;
    info!("Program directory initialized");

    // Warm up the build cache by pre-compiling dependencies
    program::warmup().await.map_err(|e| {
        error!("Failed to warmup build cache: {}", e);
        e
    })?;

    let build_tracker = BuildTracker::new(config.max_concurrent_builds);

    // Background janitor: periodically remove stale per-build directories so
    // abandoned builds don't fill the disk over time.
    let cleanup_ttl = config.build_ttl_secs;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(e) = program::cleanup_old_builds(cleanup_ttl).await {
                error!("Build cleanup failed: {}", e);
            }
        }
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/build", post(build))
        .route("/build/status/:uuid", get(build_status))
        .route("/build/status/:uuid", axum::routing::options(build_status_options))
        .route("/deploy/:uuid/:program_name", get(deploy))
        .route("/rpc", post(rpc_proxy))
        .route("/rpc", axum::routing::options(rpc_proxy_options))
        // Comment out this line
        // .layer(compression())
        .layer(payload_limit(config.payload_limit))
        .layer(cors(config.client_url))
        .layer(middleware::from_fn(log))
        .with_state(build_tracker);

    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, config.port));
    info!("Attempting to bind to {addr}");

    // Create socket with SO_REUSEADDR and SO_REUSEPORT to allow quick rebinding
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    #[cfg(unix)]
    socket.set_reuse_port(true)?;
    socket.bind(&addr.into())?;
    socket.listen(128)?;
    socket.set_nonblocking(true)?;

    let listener = TcpListener::from_std(socket.into())?;
    info!("Successfully bound to {addr}");

    info!("Starting server...");
    axum::serve(listener, app).await.map_err(|e| {
        error!("Server error: {}", e);
        e
    })?;

    Ok(())
}
