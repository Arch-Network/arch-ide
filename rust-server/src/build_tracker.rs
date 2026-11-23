use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, RwLock, Semaphore};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildStatus {
    Queued,
    Building,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildInfo {
    pub uuid: String,
    pub program_name: String,
    pub status: BuildStatus,
    pub stderr: Option<String>,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// JSON-serialized IDL extracted via `arch-satellite-lang-idl`. Populated only
    /// for satellite-framework projects whose source actually uses the
    /// satellite macros — `None` for native projects, programs without
    /// `#[program]` decorators, or when extraction fails (extraction
    /// failures are non-fatal: the SBF binary is still built).
    pub idl_json: Option<String>,
}

#[derive(Clone)]
pub struct BuildTracker {
    builds: Arc<RwLock<HashMap<String, BuildInfo>>>,
    /// Caps how many compiles run concurrently. Each build task holds a
    /// permit for its full duration; excess requests queue instead of
    /// spawning unbounded `cargo-build-sbf` processes.
    build_semaphore: Arc<Semaphore>,
}

impl BuildTracker {
    pub fn new(max_concurrent_builds: usize) -> Self {
        Self {
            builds: Arc::new(RwLock::new(HashMap::new())),
            build_semaphore: Arc::new(Semaphore::new(max_concurrent_builds.max(1))),
        }
    }

    /// Acquire a build slot, waiting if all slots are in use. The returned
    /// permit must be held for the lifetime of the build; dropping it frees
    /// the slot for the next queued build.
    pub async fn acquire_build_permit(&self) -> OwnedSemaphorePermit {
        // `acquire_owned` only errors if the semaphore is closed, which we
        // never do, so this is effectively infallible.
        self.build_semaphore
            .clone()
            .acquire_owned()
            .await
            .expect("build semaphore closed unexpectedly")
    }

    pub async fn start_build(&self, uuid: String, program_name: String) {
        let mut builds = self.builds.write().await;
        builds.insert(
            uuid.clone(),
            BuildInfo {
                uuid,
                program_name,
                status: BuildStatus::Building,
                stderr: None,
                started_at: chrono::Utc::now(),
                completed_at: None,
                idl_json: None,
            },
        );
    }

    /// Append a line to the build's stderr while status is still Building. Used for live output.
    pub async fn append_build_output(&self, uuid: &str, line: &str) {
        let line = crate::redact::redact_secrets(line);
        let mut builds = self.builds.write().await;
        if let Some(info) = builds.get_mut(uuid) {
            if matches!(info.status, BuildStatus::Building) {
                match &mut info.stderr {
                    Some(s) => {
                        s.push_str(&line);
                        s.push('\n');
                    }
                    None => {
                        info.stderr = Some(format!("{line}\n"));
                    }
                }
            }
        }
    }

    pub async fn complete_build(
        &self,
        uuid: &str,
        stderr: String,
        program_name: String,
        success: bool,
        idl_json: Option<String>,
    ) {
        println!("[TRACKER] complete_build called for UUID: {}, success: {}", uuid, success);
        let mut builds = self.builds.write().await;
        println!("[TRACKER] Got write lock for UUID: {}", uuid);

        if let Some(info) = builds.get_mut(uuid) {
            println!("[TRACKER] Found build info for UUID: {}, updating status", uuid);
            info.status = if success { BuildStatus::Success } else { BuildStatus::Failed };
            info.stderr = Some(crate::redact::redact_secrets(&stderr));
            info.program_name = program_name;
            info.completed_at = Some(chrono::Utc::now());
            info.idl_json = idl_json;
            println!(
                "[TRACKER] Updated build info for UUID: {}, new status: {:?}, has idl: {}",
                uuid,
                info.status,
                info.idl_json.is_some()
            );
        } else {
            println!("[TRACKER] WARNING: Build info NOT FOUND for UUID: {}", uuid);
        }
    }

    pub async fn get_build(&self, uuid: &str) -> Option<BuildInfo> {
        let builds = self.builds.read().await;
        builds.get(uuid).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::BuildTracker;

    const UUID: &str = "550e8400-e29b-41d4-a716-446655440000";

    #[tokio::test]
    async fn stored_compiler_output_has_no_token() {
        let tracker = BuildTracker::new(1);
        tracker.start_build(UUID.to_string(), "demo".to_string()).await;
        tracker
            .append_build_output(
                UUID,
                "Unable to update https://ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:x-oauth-basic@github.com/Arch-Network/arch-network",
            )
            .await;
        let live = tracker.get_build(UUID).await.unwrap().stderr.unwrap();
        assert!(!live.contains("ghp_"));
        assert!(!live.contains("x-oauth-basic"));

        tracker
            .complete_build(
                UUID,
                "gho_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB github_pat_11AAAAAAA0abc ghs_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".into(),
                "demo".into(),
                false,
                None,
            )
            .await;
        let final_log = tracker.get_build(UUID).await.unwrap().stderr.unwrap();
        assert!(!final_log.contains("gho_"));
        assert!(!final_log.contains("ghs_"));
        assert!(!final_log.contains("github_pat_"));
    }
}
