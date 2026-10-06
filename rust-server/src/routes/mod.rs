mod build;
mod deploy;
mod explorer_proxy;
mod rpc_proxy;

pub use build::*;
pub use deploy::*;
pub use explorer_proxy::*;
pub use rpc_proxy::*;

use axum::response::IntoResponse;

pub async fn health() -> impl IntoResponse {
    "OK"
}