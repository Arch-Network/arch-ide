use axum::{
    extract::Query,
    http::{StatusCode, HeaderMap},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{error, info};

#[derive(Debug, Deserialize)]
pub struct RpcProxyQuery {
    target: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Value,
    method: String,
    params: Vec<Value>,
}

/// Proxy endpoint for RPC requests to avoid CORS issues
pub async fn rpc_proxy(
    Query(query): Query<RpcProxyQuery>,
    _headers: HeaderMap,
    body: String,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Default RPC URL - can be overridden via query param
    let default_rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "https://rpc.testnet.arch.network".to_string());

    let target_url = query.target.as_deref().unwrap_or(&default_rpc_url);

    info!("Proxying RPC request to: {}", target_url);

    // Parse and validate the request
    let rpc_request: JsonRpcRequest = serde_json::from_str(&body)
        .map_err(|e| {
            error!("Failed to parse RPC request: {}", e);
            (StatusCode::BAD_REQUEST, format!("Invalid JSON-RPC request: {}", e))
        })?;

    info!("RPC method: {}", rpc_request.method);

    // Create HTTP client
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| {
            error!("Failed to create HTTP client: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create client: {}", e))
        })?;

    // Forward the request to the target RPC server
    let response = client
        .post(target_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to send RPC request: {}", e);
            (StatusCode::BAD_GATEWAY, format!("Failed to connect to RPC server: {}", e))
        })?;

    let status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|e| {
            error!("Failed to read RPC response: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read response: {}", e))
        })?;

    info!("RPC response status: {}", status);

    // Convert reqwest::StatusCode to axum::http::StatusCode
    let axum_status = StatusCode::from_u16(status.as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    // Return the response with CORS headers
    Ok((
        axum_status,
        [
            ("Content-Type", "application/json"),
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type, Accept"),
        ],
        response_body,
    ))
}

/// Handle OPTIONS preflight requests
pub async fn rpc_proxy_options() -> impl IntoResponse {
    (
        StatusCode::OK,
        [
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type, Accept"),
            ("Access-Control-Max-Age", "3600"),
        ],
    )
}
