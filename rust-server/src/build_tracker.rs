use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
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
}

#[derive(Clone)]
pub struct BuildTracker {
    builds: Arc<RwLock<HashMap<String, BuildInfo>>>,
}

impl BuildTracker {
    pub fn new() -> Self {
        Self {
            builds: Arc::new(RwLock::new(HashMap::new())),
        }
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
            },
        );
    }

    /// Append a line to the build's stderr while status is still Building. Used for live output.
    pub async fn append_build_output(&self, uuid: &str, line: &str) {
        let mut builds = self.builds.write().await;
        if let Some(info) = builds.get_mut(uuid) {
            if matches!(info.status, BuildStatus::Building) {
                match &mut info.stderr {
                    Some(s) => {
                        s.push_str(line);
                        s.push('\n');
                    }
                    None => {
                        info.stderr = Some(format!("{line}\n"));
                    }
                }
            }
        }
    }

    pub async fn complete_build(&self, uuid: &str, stderr: String, program_name: String, success: bool) {
        println!("[TRACKER] complete_build called for UUID: {}, success: {}", uuid, success);
        let mut builds = self.builds.write().await;
        println!("[TRACKER] Got write lock for UUID: {}", uuid);

        if let Some(info) = builds.get_mut(uuid) {
            println!("[TRACKER] Found build info for UUID: {}, updating status", uuid);
            info.status = if success { BuildStatus::Success } else { BuildStatus::Failed };
            info.stderr = Some(stderr);
            info.program_name = program_name;
            info.completed_at = Some(chrono::Utc::now());
            println!("[TRACKER] Updated build info for UUID: {}, new status: {:?}", uuid, info.status);
        } else {
            println!("[TRACKER] WARNING: Build info NOT FOUND for UUID: {}", uuid);
        }
    }

    pub async fn get_build(&self, uuid: &str) -> Option<BuildInfo> {
        let builds = self.builds.read().await;
        builds.get(uuid).cloned()
    }
}
