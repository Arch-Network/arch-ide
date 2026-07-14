use std::env;

#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub client_url: String,
    pub verbose: bool,
    pub payload_limit: usize,
    /// Maximum number of compiles allowed to run at once. Extra `/build`
    /// requests queue for a permit instead of spawning unbounded work.
    pub max_concurrent_builds: usize,
    /// How long (seconds) a build directory is kept before the periodic
    /// janitor removes it, reclaiming disk from abandoned builds.
    pub build_ttl_secs: u64,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a number"),
            client_url: env::var("CLIENT_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            verbose: env::var("VERBOSE").is_ok(),
            payload_limit: env::var("PAYLOAD_LIMIT")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .expect("PAYLOAD_LIMIT must be a number"),
            max_concurrent_builds: env::var("MAX_CONCURRENT_BUILDS")
                .ok()
                .and_then(|v| v.parse().ok())
                .filter(|&n| n > 0)
                .unwrap_or(4),
            build_ttl_secs: env::var("BUILD_TTL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(86_400),
        }
    }
}