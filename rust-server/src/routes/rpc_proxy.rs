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

/// Whether `url` is an acceptable proxy target. We only forward to Arch
/// Network endpoints (or an operator-configured `RPC_URL`) so this endpoint
/// can't be abused as an open relay / SSRF into cloud metadata or internal
/// services (e.g. `http://169.254.169.254/`).
fn is_allowed_rpc_target(url: &str, default_url: &str) -> bool {
    let host_of = |u: &str| {
        reqwest::Url::parse(u)
            .ok()
            .filter(|p| matches!(p.scheme(), "http" | "https"))
            .and_then(|p| p.host_str().map(|h| h.to_ascii_lowercase()))
    };

    let host = match host_of(url) {
        Some(h) => h,
        None => return false,
    };

    // Always allow the configured/default upstream.
    if let Some(default_host) = host_of(default_url) {
        if host == default_host {
            return true;
        }
    }

    // Allow the canonical Arch Network domains.
    host == "arch.network" || host.ends_with(".arch.network")
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

    // Reject targets outside the allowlist before making any outbound request.
    if !is_allowed_rpc_target(target_url, &default_rpc_url) {
        error!("Rejected RPC proxy target (not allowlisted): {}", target_url);
        return Err((
            StatusCode::FORBIDDEN,
            "RPC proxy target not allowed".to_string(),
        ));
    }

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

#[cfg(test)]
mod tests {
    use super::is_allowed_rpc_target;

    const DEFAULT: &str = "https://rpc.testnet.arch.network";

    #[test]
    fn allows_default_and_arch_hosts() {
        assert!(is_allowed_rpc_target(DEFAULT, DEFAULT));
        assert!(is_allowed_rpc_target("https://rpc.mainnet.arch.network", DEFAULT));
        assert!(is_allowed_rpc_target("https://arch.network", DEFAULT));
        assert!(is_allowed_rpc_target("https://RPC.TESTNET.ARCH.NETWORK", DEFAULT));
    }

    #[test]
    fn rejects_non_arch_and_internal_targets() {
        assert!(!is_allowed_rpc_target("http://169.254.169.254/latest/meta-data", DEFAULT));
        assert!(!is_allowed_rpc_target("http://localhost:8080/admin", DEFAULT));
        assert!(!is_allowed_rpc_target("https://evil.com", DEFAULT));
        // Suffix spoofing: not a subdomain of arch.network.
        assert!(!is_allowed_rpc_target("https://notarch.network", DEFAULT));
        assert!(!is_allowed_rpc_target("https://arch.network.evil.com", DEFAULT));
    }

    #[test]
    fn rejects_malformed_and_non_http_schemes() {
        assert!(!is_allowed_rpc_target("not a url", DEFAULT));
        assert!(!is_allowed_rpc_target("", DEFAULT));
        assert!(!is_allowed_rpc_target("file:///etc/passwd", DEFAULT));
        assert!(!is_allowed_rpc_target("ftp://arch.network", DEFAULT));
    }

    #[test]
    fn allows_operator_configured_default_host() {
        let custom_default = "http://my-devnet.internal:9002";
        assert!(is_allowed_rpc_target("http://my-devnet.internal:9002", custom_default));
        assert!(!is_allowed_rpc_target("http://other.internal:9002", custom_default));
    }
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
