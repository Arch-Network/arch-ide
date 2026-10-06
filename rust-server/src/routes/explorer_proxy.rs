use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use tracing::{error, info, warn};

const EXPLORER_ORIGIN: &str = "https://explorer.arch.network";
const PROXY_TIMEOUT_SECS: u64 = 20;
const DEFAULT_LIMIT: u32 = 25;
const MAX_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
pub struct ProgramTxQuery {
    limit: Option<u32>,
    offset: Option<u32>,
}

/// Only the two public indexed networks. Anything else is rejected so this
/// handler cannot be used as an open proxy (SSRF).
fn parse_network(network: &str) -> Option<&'static str> {
    match network {
        "testnet" => Some("testnet"),
        "mainnet" => Some("mainnet"),
        _ => None,
    }
}

/// Arch program ids are 32-byte pubkeys encoded as 64 hex characters.
fn is_program_id_hex(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

fn clamp_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn clamp_offset(offset: Option<u32>) -> u32 {
    offset.unwrap_or(0)
}

fn upstream_url(network: &str, program_id: &str, limit: u32, offset: u32) -> String {
    format!(
        "{EXPLORER_ORIGIN}/api/v1/{network}/programs/{program_id}/transactions?limit={limit}&offset={offset}"
    )
}

/// GET /explorer/:network/programs/:program_id/transactions
///
/// Forwards History's indexer query to explorer.arch.network from the
/// server so the browser never hits Explorer CORS. The client cannot
/// choose the upstream host.
pub async fn explorer_program_transactions(
    Path((network, program_id)): Path<(String, String)>,
    Query(query): Query<ProgramTxQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let network = parse_network(&network).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "network must be testnet or mainnet".to_string(),
        )
    })?;

    if !is_program_id_hex(&program_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            "program_id must be 64 hex characters".to_string(),
        ));
    }

    let limit = clamp_limit(query.limit);
    let offset = clamp_offset(query.offset);
    let url = upstream_url(network, &program_id, limit, offset);

    info!(
        "Proxying explorer program transactions network={network} program_id={program_id} limit={limit} offset={offset}"
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(PROXY_TIMEOUT_SECS))
        .build()
        .map_err(|e| {
            error!("Failed to create explorer HTTP client: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create HTTP client".to_string(),
            )
        })?;

    let mut req = client.get(&url).header("Accept", "application/json");
    // Optional server-side key only. Never accept a key from the browser.
    if let Ok(key) = std::env::var("EXPLORER_API_KEY") {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
    }

    let response = req.send().await.map_err(|e| {
        warn!("Explorer upstream request failed: {e}");
        (
            StatusCode::BAD_GATEWAY,
            "Failed to reach Arch Explorer".to_string(),
        )
    })?;

    let status = response.status();
    let body = response.text().await.map_err(|e| {
        error!("Failed to read explorer response: {e}");
        (
            StatusCode::BAD_GATEWAY,
            "Failed to read Explorer response".to_string(),
        )
    })?;

    info!("Explorer upstream status={}", status.as_u16());

    let axum_status =
        StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    Ok((
        axum_status,
        [("Content-Type", "application/json")],
        body,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_indexed_networks() {
        assert_eq!(parse_network("testnet"), Some("testnet"));
        assert_eq!(parse_network("mainnet"), Some("mainnet"));
        assert_eq!(parse_network("devnet"), None);
        assert_eq!(parse_network("TESTNET"), None);
        assert_eq!(parse_network("https://evil.example"), None);
        assert_eq!(parse_network("../mainnet"), None);
    }

    #[test]
    fn accepts_only_64_hex_program_ids() {
        let ok = "0123456789abcdef0123456789ABCDEF0123456789abcdef0123456789abcdef";
        assert!(is_program_id_hex(ok));
        assert!(!is_program_id_hex(""));
        assert!(!is_program_id_hex("zz"));
        assert!(!is_program_id_hex(&ok[..63]));
        assert!(!is_program_id_hex(&format!("{ok}aa")));
        assert!(!is_program_id_hex("http://169.254.169.254/latest"));
        assert!(!is_program_id_hex("../../../etc/passwd"));
    }

    #[test]
    fn clamps_pagination() {
        assert_eq!(clamp_limit(None), 25);
        assert_eq!(clamp_limit(Some(0)), 1);
        assert_eq!(clamp_limit(Some(10)), 10);
        assert_eq!(clamp_limit(Some(9999)), 100);
        assert_eq!(clamp_offset(None), 0);
        assert_eq!(clamp_offset(Some(50)), 50);
    }

    #[test]
    fn upstream_url_is_pinned_to_explorer() {
        let id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let url = upstream_url("testnet", id, 25, 0);
        assert!(url.starts_with("https://explorer.arch.network/api/v1/testnet/programs/"));
        assert!(!url.contains("169.254"));
        assert_eq!(
            url,
            format!("https://explorer.arch.network/api/v1/testnet/programs/{id}/transactions?limit=25&offset=0")
        );
    }
}
