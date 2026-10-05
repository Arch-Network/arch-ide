use anyhow::anyhow;
use axum::{extract::Path, response::IntoResponse};
use tokio::io;

use crate::{error::{Error, Result}, program::{self, BinaryData}};

pub async fn deploy(Path((uuid, program_name)): Path<(String, String)>) -> Result<impl IntoResponse> {
    tracing::info!("Attempting to deploy program with UUID: {} and name: {}", uuid, program_name);

    // The UUID is used to build a filesystem path; reject anything that is
    // not a canonical UUID so it can never escape the programs directory.
    if !program::is_valid_uuid(&uuid) {
        return Err(Error::BadRequest("Invalid UUID".to_string()));
    }

    let binary = program::get_binary(&uuid, &program_name)
        .await
        .map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => anyhow!("Program is not built"),
            _ => e.into(),
        })
        .map_err(|e: anyhow::Error| crate::error::Error::from(e))?;

    // Log the actual size of the binary
    tracing::info!("Program binary retrieved successfully, size: {} bytes", binary.len());

    // Check if the binary starts with ELF magic bytes (should be 0x7F, 'E', 'L', 'F')
    if binary.len() >= 4 {
        tracing::info!("Binary starts with: {:?}", &binary[0..4]);
    } else {
        tracing::info!("Binary is too small: {} bytes", binary.len());
    }

    // Use our wrapper type instead of the raw response construction
    Ok(BinaryData(binary))
}