use anyhow::anyhow;
use axum::{extract::{Json, Path, State}, response::IntoResponse, http::{StatusCode, HeaderMap, header}};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{build_tracker::BuildTracker, error::Result, program::{self, Files}};

#[derive(Deserialize)]
pub struct BuildRequest {
    program_name: String,
    files: Files,
    uuid: Option<String>,
    /// "satellite" → arch_program 0.5.15 (satellite-lang compatible). "native" → arch_program 0.6.0. Default: "satellite".
    #[serde(default)]
    framework: Option<String>,
}

#[derive(Serialize)]
struct BuildResponse {
    uuid: String,
    program_name: String,
    status: String,
}

#[derive(Serialize)]
struct BuildStatusResponse {
    uuid: String,
    program_name: String,
    status: String,
    stderr: Option<String>,
    started_at: String,
    completed_at: Option<String>,
}

pub async fn build(
    State(tracker): State<BuildTracker>,
    Json(payload): Json<BuildRequest>,
) -> Result<impl IntoResponse> {
    let uuid = match payload.uuid {
        Some(uuid) => {
            Uuid::try_parse(&uuid)
                .map(|_| uuid)
                .map_err(|_| anyhow!("Invalid UUID"))?
        },
        None => Uuid::new_v4().to_string(),
    };

    let files = payload.files;
    let program_name = payload.program_name.clone();
    let uuid_clone = uuid.clone();
    let tracker_clone = tracker.clone();
    let framework = match payload.framework.as_deref() {
        Some("native") => program::BuildFramework::Native,
        _ => program::BuildFramework::Satellite, // "satellite" or missing → Satellite (0.5.15)
    };

    // Start tracking the build
    tracker.start_build(uuid.clone(), program_name.clone()).await;

    // Spawn the build task in the background
    tokio::spawn(async move {
        println!("[BUILD] Starting background build task for UUID: {} (framework: {:?})", uuid_clone, framework);

        let (tx, mut rx) = mpsc::channel::<String>(256);
        let tracker_for_rx = tracker_clone.clone();
        let uuid_for_rx = uuid_clone.clone();
        let receiver_handle = tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                tracker_for_rx.append_build_output(&uuid_for_rx, &line).await;
            }
        });

        let result = program::build(&uuid_clone, &program_name, &files, framework, Some(tx)).await;
        // tx moved into build(); when build returns it's dropped, so rx.recv() yields None and receiver exits
        let _ = receiver_handle.await;

        println!("[BUILD] Build function returned for UUID: {}", uuid_clone);

        match result {
            Ok((stderr, final_program_name)) => {
                println!("[BUILD] Build Ok for UUID: {}", uuid_clone);
                println!("[BUILD] stderr length: {} bytes", stderr.len());
                println!("[BUILD] stderr contains 'Finished': {}", stderr.contains("Finished"));
                println!("[BUILD] stderr contains 'release': {}", stderr.contains("release"));
                println!("[BUILD] stderr contains '`release`': {}", stderr.contains("`release`"));
                println!("[BUILD] stderr contains 'error: could not compile': {}", stderr.contains("error: could not compile"));

                // Check if build actually succeeded by looking for compilation success indicators
                let build_succeeded = stderr.contains("Finished") &&
                                     (stderr.contains("release") || stderr.contains("`release`")) &&
                                     !stderr.contains("error: could not compile");

                println!("[BUILD] build_succeeded: {}", build_succeeded);
                println!("[BUILD] Calling complete_build for UUID: {} with status: {}", uuid_clone, if build_succeeded { "Success" } else { "Failed" });

                tracker_clone.complete_build(&uuid_clone, stderr, final_program_name, build_succeeded).await;

                println!("[BUILD] complete_build finished for UUID: {}", uuid_clone);
            },
            Err(e) => {
                println!("[BUILD] Build Err for UUID: {}, error: {}", uuid_clone, e);
                let error_msg = format!("Build failed: {}", e);
                tracker_clone.complete_build(&uuid_clone, error_msg, program_name, false).await;
                println!("[BUILD] complete_build (error) finished for UUID: {}", uuid_clone);
            }
        }

        println!("[BUILD] Background task completed for UUID: {}", uuid_clone);
    });

    Ok(Json(BuildResponse {
        uuid,
        program_name: payload.program_name,
        status: "building".to_string(),
    }))
}

pub async fn build_status(
    State(tracker): State<BuildTracker>,
    Path(uuid): Path<String>,
) -> Result<impl IntoResponse> {
    // CRITICAL: Add no-cache headers to prevent CloudFront/browser caching
    // Build status must ALWAYS be fresh since it changes from "building" -> "success"/"failed"
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate".parse().unwrap());
    headers.insert(header::PRAGMA, "no-cache".parse().unwrap());
    headers.insert(header::EXPIRES, "0".parse().unwrap());

    match tracker.get_build(&uuid).await {
        Some(info) => Ok((
            StatusCode::OK,
            headers,
            Json(BuildStatusResponse {
                uuid: info.uuid,
                program_name: info.program_name,
                status: format!("{:?}", info.status).to_lowercase(),
                stderr: info.stderr,
                started_at: info.started_at.to_rfc3339(),
                completed_at: info.completed_at.map(|dt| dt.to_rfc3339()),
            }),
        )),
        None => Ok((
            StatusCode::NOT_FOUND,
            headers,
            Json(BuildStatusResponse {
                uuid: uuid.clone(),
                program_name: "unknown".to_string(),
                status: "not_found".to_string(),
                stderr: Some("Build not found".to_string()),
                started_at: chrono::Utc::now().to_rfc3339(),
                completed_at: None,
            }),
        )),
    }
}

/// Handle OPTIONS preflight requests for build_status
pub async fn build_status_options() -> impl IntoResponse {
    (
        StatusCode::OK,
        [
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "GET, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type, Accept, Cache-Control, Pragma"),
            ("Access-Control-Max-Age", "3600"),
        ],
    )
}