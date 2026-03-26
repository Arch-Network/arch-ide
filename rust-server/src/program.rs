use std::{fs, path::Path, process::Command, sync::OnceLock, env};
use anyhow::anyhow;
use regex::Regex;
use tokio::sync::mpsc;
use tokio::sync::OnceCell;
use cloud_storage::Client;
use tracing::info;
use tokio::process::Command as TokioCommand;
use tokio::io::{BufReader, AsyncBufReadExt};
use std::process::Stdio;
use axum::http::{header, HeaderValue};
use axum::response::IntoResponse;

const PROGRAMS_DIR: &str = "programs";
/// Maximum number of source files per build (raised to support larger dropped projects e.g. Whirlpool-style).
const MAX_FILE_AMOUNT: usize = 256;
const MAX_PATH_LENGTH: usize = 128;

/// Arch crate version used by the compilation server: 0.6.2
/// All arch_program, apl-token, apl-associated-token-account, and apl-token-metadata
/// crates are pulled from crates.io at this version.

fn use_gcs() -> bool {
    std::env::var("USE_GCS").is_ok()
}

static INIT: OnceCell<()> = OnceCell::const_new();
static GCS_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_gcs_bucket() -> String {
    env::var("GCS_BUCKET").unwrap_or_else(|_| "arch-ide-build-artifacts".to_string())
}

fn find_solana_rustc_path() -> Option<String> {
    // Probe common Solana cache locations for the bundled rustc used by cargo-build-sbf
    let cache_root = Path::new("/root/.cache/solana");
    if let Ok(entries) = fs::read_dir(cache_root) {
        let mut candidates: Vec<std::path::PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path().join("platform-tools/rust/bin/rustc");
            if p.exists() {
                candidates.push(p);
            }
        }
        // Prefer lexicographically last (usually highest vXX directory)
        candidates.sort();
        if let Some(p) = candidates.last() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

/// Cargo.toml template for Satellite framework: arch_program 0.6.2 + arch-satellite-lang 0.31.5.
const CARGO_TOML_TEMPLATE_SATELLITE: &str = r#"[package]
name = "__PROGRAM_NAME__"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
arch_program = "0.6.2"
apl-associated-token-account = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token-metadata = { version = "0.6.2", features = ["no-entrypoint"] }

# Satellite framework
arch-satellite-lang = "0.31.5"
arch-satellite-apl = "0.31.5"

# Core serialization/encoding (use "borsh" in code, not "borsh09")
borsh = "^1.5.3"
base64 = { version = "=0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "=0.4.3", default-features = false }
sha256 = { version = "=1.5.0", default-features = false }

# Error handling
thiserror = "^1.0.57"

# Serialization
serde = { version = "^1.0.216", features = ["derive"], default-features = false }

# Memory casting utilities
bytemuck = { version = "^1.20.0", features = ["derive"] }

# Big-integer (U256 via construct_uint!) and array reference (for bn.rs / sparse_swap-style code)
uint = "0.9"
arrayref = "0.3"

# SBF toolchain compatibility: Cargo 1.84 cannot parse crates that use
# edition = "2024" in their Cargo.toml manifest. Many crates in the toml-rs
# ecosystem shipped 1.1.0 / 0.25.6+ releases with edition2024 that Cargo 1.84
# cannot process. These pins cap EVERY affected semver range so the resolver
# never selects an unparseable version. Remove when the SBF toolchain ships
# Cargo >= 1.85.
toml_edit = ">=0.25.0, <0.25.6"
toml_datetime = ">=1.0.0, <1.1.0"
toml_parser = ">=1.0.0, <1.1.0"
toml_writer = ">=1.0.0, <1.1.0"
serde_spanned = ">=1.0.0, <1.1.0"
unicode-segmentation = ">=1.0.0, <1.13.0"

[profile.release]
overflow-checks = true
incremental = true
codegen-units = 256
opt-level = 1
lto = false
debug = false

[profile.release.build-override]
opt-level = 1
incremental = true
codegen-units = 256
"#;

/// Cargo.toml template for native / latest: arch_program 0.6.2 (no arch-satellite-lang version yet).
const CARGO_TOML_TEMPLATE_NATIVE: &str = r#"[package]
name = "__PROGRAM_NAME__"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
arch_program = "0.6.2"
apl-associated-token-account = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token-metadata = { version = "0.6.2", features = ["no-entrypoint"] }

# Satellite framework
arch-satellite-lang = "0.31.5"
arch-satellite-apl = "0.31.5"

# Core serialization/encoding (use "borsh" in code, not "borsh09")
borsh = "^1.5.3"
base64 = { version = "=0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "=0.4.3", default-features = false }
sha256 = { version = "=1.5.0", default-features = false }

# Error handling
thiserror = "^1.0.57"

# Serialization
serde = { version = "^1.0.216", features = ["derive"], default-features = false }

# Memory casting utilities
bytemuck = { version = "^1.20.0", features = ["derive"] }

# Big-integer (U256 via construct_uint!) and array reference (for bn.rs / sparse_swap-style code)
uint = "0.9"
arrayref = "0.3"

# SBF toolchain compatibility: see satellite template for explanation
toml_edit = ">=0.25.0, <0.25.6"
toml_datetime = ">=1.0.0, <1.1.0"
toml_parser = ">=1.0.0, <1.1.0"
toml_writer = ">=1.0.0, <1.1.0"
serde_spanned = ">=1.0.0, <1.1.0"
unicode-segmentation = ">=1.0.0, <1.13.0"

[profile.release]
overflow-checks = true
incremental = true
codegen-units = 256
opt-level = 1
lto = false
debug = false

[profile.release.build-override]
opt-level = 1
incremental = true
codegen-units = 256
"#;

/// Framework / SDK version selector. Used to pick the right Cargo.toml dependency set.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BuildFramework {
    /// Satellite framework: arch_program 0.6.2 + arch-satellite-lang 0.31.5.
    Satellite,
    /// Native / latest: arch_program 0.6.2.
    Native,
}

fn build_diagnostics_enabled() -> bool {
    // Off by default to preserve caching + keep builds fast.
    // Enable ad-hoc with BUILD_DIAGNOSTICS=1 in the server environment.
    env::var("BUILD_DIAGNOSTICS")
        .map(|v| !v.trim().is_empty() && v.trim() != "0" && v.trim().to_lowercase() != "false")
        .unwrap_or(false)
}

fn render_program_cargo_toml(program_name: &str, framework: BuildFramework) -> String {
    let template = match framework {
        BuildFramework::Satellite => CARGO_TOML_TEMPLATE_SATELLITE,
        BuildFramework::Native => CARGO_TOML_TEMPLATE_NATIVE,
    };
    template.replace("__PROGRAM_NAME__", program_name)
}

pub async fn init() -> anyhow::Result<()> {
    INIT.get_or_try_init(|| async {
        let programs_dir = Path::new(PROGRAMS_DIR);
        if !programs_dir.exists() {
            fs::create_dir_all(programs_dir)?;
        }

        let cargo_toml = r#"[package]
name = "archpg"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
path = "default/src/lib.rs"

[profile.release]
overflow-checks = true
incremental = true

[dependencies]
arch_program = "0.6.2"
apl-associated-token-account = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token = { version = "0.6.2", features = ["no-entrypoint"] }
apl-token-metadata = { version = "0.6.2", features = ["no-entrypoint"] }

# Satellite framework (published crate)
arch-satellite-lang = "0.31.5"
arch-satellite-apl = "0.31.5"

# Core serialization/encoding
borsh = { version = "1.5.1", features = ["derive"] }

# Utilities
base64 = { version = "0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "0.4.3", default-features = false }
sha256 = { version = "1.5.0", default-features = false }

# Error handling
thiserror = "*"

# Logging
log = "0.4.17"

# Serialization
serde = { version = "1.0.136", features = ["derive"], default-features = false }

# Memory casting utilities
bytemuck = { version = "^1.20.0", features = ["derive"] }

# SBF toolchain compatibility: cap edition2024 crates (Cargo 1.84)
toml_edit = ">=0.25.0, <0.25.6"
toml_datetime = ">=1.0.0, <1.1.0"
toml_parser = ">=1.0.0, <1.1.0"
toml_writer = ">=1.0.0, <1.1.0"
serde_spanned = ">=1.0.0, <1.1.0"
unicode-segmentation = ">=1.0.0, <1.13.0"

# Testing
[dev-dependencies]
proptest = "1.5.0""#;

        let manifest_path = programs_dir.join("Cargo.toml");
        if !manifest_path.exists() {
            fs::write(manifest_path, cargo_toml)?;
        }

        Ok::<(), anyhow::Error>(())
    }).await?;

    Ok(())
}

/// Warms up the build cache by pre-compiling dependencies
/// This significantly speeds up the first user build
pub async fn warmup() -> anyhow::Result<()> {
    info!("🔥 Warming up build cache by pre-compiling dependencies...");

    let warmup_id = "warmup-cache";
    let warmup_dir = Path::new(PROGRAMS_DIR).join(warmup_id);

    // Check if warmup build already exists (cached from previous run)
    let binary_path = warmup_dir.join("target/deploy/warmup.so");
    if binary_path.exists() {
        info!("✅ Build cache already warm (found existing warmup build)");
        return Ok(());
    }

    // Create warmup project directory structure
    fs::create_dir_all(&warmup_dir)?;
    let src_dir = warmup_dir.join("src");
    fs::create_dir_all(&src_dir)?;

    // Create minimal Cargo.toml with all dependencies
    let cargo_toml = render_program_cargo_toml("warmup", BuildFramework::Satellite);
    fs::write(warmup_dir.join("Cargo.toml"), cargo_toml)?;

    // Create minimal lib.rs that uses the dependencies
    let lib_rs = r#"use arch_program::{
    account::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use borsh::{BorshDeserialize, BorshSerialize};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> Result<(), ProgramError> {
    Ok(())
}
"#;
    fs::write(src_dir.join("lib.rs"), lib_rs)?;

    // Run the build in the background (don't block server startup)
    let warmup_dir_clone = warmup_dir.clone();
    tokio::spawn(async move {
        info!("🔨 Starting background warmup build...");
        let start = std::time::Instant::now();

        let result = TokioCommand::new("cargo")
            .args(&[
                "build-sbf",
                "--manifest-path",
                &warmup_dir_clone.join("Cargo.toml").to_string_lossy(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;

        match result {
            Ok(status) if status.success() => {
                let elapsed = start.elapsed();
                info!("✅ Build cache warmed up successfully in {:.1}s", elapsed.as_secs_f64());
                info!("   Next user build will be much faster!");
            }
            Ok(status) => {
                info!("⚠️  Warmup build exited with status: {}", status);
            }
            Err(e) => {
                info!("⚠️  Warmup build failed: {}", e);
            }
        }
    });

    info!("✅ Warmup build started in background (server ready to accept requests)");
    Ok(())
}

pub type Files = Vec<[String; 2]>;

/// Placeholder program id in Satellite/counter template; substituted at build time when program_id_hex is provided.
/// Satellite/Solana BPF declare_id! expects 64 hex chars (error: "program id must be 64 hex chars").
const DECLARE_ID_PLACEHOLDER: &str = "declare_id!(\"1111111111111111111111111111111111111111111111111111111111111111\")";

pub async fn build(
    uuid: &str,
    program_name: &str,
    files: &Files,
    framework: BuildFramework,
    program_id_hex: Option<&str>,
    output_tx: Option<mpsc::Sender<String>>, // if present, each line is sent for live UI updates
) -> anyhow::Result<(String, String)> {
    println!("Starting build for program: {} (framework: {:?})", program_name, framework);

    // Check file count
    if files.len() > MAX_FILE_AMOUNT {
        return Err(anyhow!("Exceeded maximum file amount({MAX_FILE_AMOUNT})"));
    }

    // Check file paths
    static ALLOWED_REGEX: OnceLock<Regex> = OnceLock::new();
    let allowed_regex = ALLOWED_REGEX.get_or_init(|| Regex::new(r"^/src/[\w/-]+\.rs$").unwrap());
    let is_valid = files.iter().all(|[path, _]| {
        allowed_regex.is_match(path)
            && path.len() <= MAX_PATH_LENGTH
            && !path.contains("..")
            && !path.contains("//")
    });
    if !is_valid {
        return Err(anyhow!("Invalid path"));
    }

    // Get or create program directory using UUID
    let program_path = Path::new(PROGRAMS_DIR).join(uuid);
    println!("Program directory: {:?}", program_path);

    // Ensure the program directory and its subdirectories exist
    fs::create_dir_all(&program_path)?;
    fs::create_dir_all(program_path.join("src"))?;
    fs::create_dir_all(program_path.join("target/deploy"))?;

    // Write source files (substitute declare_id! in lib.rs when program_id_base58 is set)
    println!("Writing source files...");
    for [path, content] in files {
        let relative_path = path.trim_start_matches('/');
        let file_path = program_path.join(relative_path);
        println!("Writing file: {:?}", file_path);

        let parent = file_path.parent().expect("Should have parent");
        fs::create_dir_all(parent)?;
        let content_to_write: String = if relative_path == "src/lib.rs" {
            match program_id_hex {
                Some(hex) if content.contains(DECLARE_ID_PLACEHOLDER) => {
                    let hex_trim = hex.trim_start_matches("0x");
                    if hex_trim.len() != 64 || !hex_trim.chars().all(|c| c.is_ascii_hexdigit()) {
                        println!("Warning: program_id_hex should be 64 hex chars, got {} chars; substituting anyway", hex_trim.len());
                    }
                    let replacement = format!("declare_id!(\"{}\")", hex_trim);
                    println!("Substituting declare_id! placeholder with program id (hex) in lib.rs");
                    content.replace(DECLARE_ID_PLACEHOLDER, &replacement)
                }
                _ => content.clone(),
            }
        } else {
            content.clone()
        };
        fs::write(&file_path, &content_to_write)?;
    }

    // Create program-specific Cargo.toml with sanitized name
    println!("Creating Cargo.toml...");
    let safe_program_name = program_name.replace(|c: char| !c.is_alphanumeric(), "_");
    let cargo_toml = render_program_cargo_toml(&safe_program_name, framework);
    let manifest_path = program_path.join("Cargo.toml");

    // Debug output for Cargo.toml creation
    println!("Writing Cargo.toml to: {:?}", manifest_path);
    println!("Cargo.toml contents:\n{}", cargo_toml);

    // Write Cargo.toml and verify it exists
    fs::write(&manifest_path, &cargo_toml)?;
    if !manifest_path.exists() {
        return Err(anyhow!("Failed to create Cargo.toml file"));
    }

    // Set up shared target directory for compiled artifacts
    println!("Setting up shared target directory...");
    let programs_dir = Path::new(PROGRAMS_DIR);
    let target_dir = programs_dir.join("target");
    fs::create_dir_all(&target_dir)?;

    // CRITICAL: Set up shared CARGO_HOME for caching downloaded crates and registry
    // This prevents re-downloading dependencies for every build!
    let cargo_home = programs_dir.join(".cargo");
    fs::create_dir_all(&cargo_home)?;
    println!("Using shared CARGO_HOME: {:?}", cargo_home);

    // Make sure cache directories have proper permissions
    let _ = Command::new("chmod")
        .arg("-R")
        .arg("777")
        .arg(&target_dir)
        .output();
    let _ = Command::new("chmod")
        .arg("-R")
        .arg("777")
        .arg(&cargo_home)
        .output();

    let shared_target = match target_dir.canonicalize() {
        Ok(path) => path,
        Err(e) => {
            println!("Warning: Failed to canonicalize target path: {}", e);
            target_dir.clone()
        }
    };
    println!("Using shared target directory: {:?}", shared_target);

    let shared_cargo_home = match cargo_home.canonicalize() {
        Ok(path) => path,
        Err(e) => {
            println!("Warning: Failed to canonicalize cargo home path: {}", e);
            cargo_home.clone()
        }
    };
    let shared_cargo_home_str = shared_cargo_home.to_str()
        .ok_or_else(|| anyhow!("Failed to convert cargo home path to string"))?
        .to_string();

    // Always remove any existing Cargo.lock so Cargo re-resolves with the
    // version caps in [dependencies] (proc-macro-crate, toml_edit, toml_datetime).
    let lock_file = program_path.join("Cargo.lock");
    if lock_file.exists() {
        println!("Removing existing Cargo.lock to allow fresh dependency resolution with SBF-compatible pins.");
        fs::remove_file(&lock_file)?;
    }

    // Check if cargo is installed
    println!("Checking if cargo is installed...");
    let cargo_path = Command::new("which").arg("cargo").output();

    if let Ok(output) = cargo_path {
        if output.status.success() {
            println!("Cargo is installed at: {}", String::from_utf8_lossy(&output.stdout));
        } else {
            println!("Cargo is not installed. Attempting to use PATH environment variable.");
            // Try to find cargo in PATH
            if let Ok(path) = env::var("PATH") {
                println!("PATH: {}", path);
            }

            // Try to install cargo if not found
            println!("Attempting to install Rust and Cargo...");
            let install_result = Command::new("sh")
                .arg("-c")
                .arg("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y")
                .output();

            match install_result {
                Ok(output) => {
                    println!("Rust installation output: {}", String::from_utf8_lossy(&output.stdout));
                    println!("Rust installation error: {}", String::from_utf8_lossy(&output.stderr));
                },
                Err(e) => println!("Failed to install Rust: {}", e)
            }
        }
    } else {
        println!("Failed to check if cargo is installed: {}", cargo_path.err().unwrap());
    }

    // Check Cargo version to determine if we need the lockfile bump flag
    println!("Checking Cargo version...");
    let cargo_version_output = Command::new("cargo")
        .arg("--version")
        .output();

    let needs_lockfile_bump = match cargo_version_output {
        Ok(output) => {
            if output.status.success() {
                let cargo_version = String::from_utf8_lossy(&output.stdout);
                println!("Detected Cargo version: {}", cargo_version);
                cargo_version.contains("1.75")
            } else {
                println!("Failed to get Cargo version: {}", String::from_utf8_lossy(&output.stderr));
                false
            }
        },
        Err(e) => {
            println!("Error checking Cargo version: {}", e);
            false
        }
    };

    // Create string bindings with absolute paths
    let manifest_path_str = program_path
        .canonicalize()
        .unwrap_or(program_path.clone())
        .join("Cargo.toml")
        .to_str()
        .expect("Manifest path should be UTF-8")
        .to_string();

    let deploy_dir_str = program_path
        .canonicalize()
        .unwrap_or(program_path.clone())
        .join("target/deploy")
        .to_str()
        .expect("Deploy directory path should be UTF-8")
        .to_string();

    let shared_target_str = shared_target
        .canonicalize()
        .unwrap_or(shared_target.clone())
        .to_str()
        .expect("Shared target directory path should be UTF-8")
        .to_string();

    // Verify paths exist
    println!("Verifying paths exist:");
    println!("Manifest path exists: {}", Path::new(&manifest_path_str).exists());
    println!("Deploy dir exists: {}", Path::new(&deploy_dir_str).exists());
    println!("Shared target exists: {}", Path::new(&shared_target_str).exists());

    let mut getrandom_diag = String::new();
    if build_diagnostics_enabled() {
        // Pre-build diagnostic: find who depends on getrandom
        println!("Running diagnostics: 'cargo tree -i getrandom'...");
        let tree_diag_output = Command::new("cargo")
            .args(["tree", "-i", "getrandom"]) // show inverse deps of getrandom
            .current_dir(&program_path)
            .output();

        match tree_diag_output {
            Ok(output) => {
                let out = String::from_utf8_lossy(&output.stdout);
                let err = String::from_utf8_lossy(&output.stderr);
                println!("cargo tree (stdout):\n{}", out);
                if !err.is_empty() { println!("cargo tree (stderr):\n{}", err); }
                getrandom_diag.push_str("\n--- cargo tree -i getrandom ---\n");
                getrandom_diag.push_str(&out);
                if !err.is_empty() {
                    getrandom_diag.push_str("\n[stderr from cargo tree]\n");
                    getrandom_diag.push_str(&err);
                }
            },
            Err(e) => {
                let msg = format!("Failed to run cargo tree: {}", e);
                println!("{}", msg);
                getrandom_diag.push_str("\n--- cargo tree -i getrandom failed ---\n");
                getrandom_diag.push_str(&msg);
            }
        }
    }

    if build_diagnostics_enabled() {
        // NOTE: This is intentionally diagnostics-only. Running cargo update each build destroys
        // incremental caching and forces re-resolving/downloading crates.
        println!("Running diagnostics: cargo update -p bytemuck ...");
        let update_status = Command::new("cargo")
            .args(["update", "-p", "bytemuck"])
            .current_dir(&program_path)
            .output();

        match update_status {
            Ok(output) => {
                println!("Cargo update output: {}", String::from_utf8_lossy(&output.stdout));
                if !output.status.success() {
                    println!("Cargo update stderr: {}", String::from_utf8_lossy(&output.stderr));
                    println!("Warning: cargo update failed, but continuing with build anyway");
                }
            },
            Err(e) => println!("Failed to run cargo update: {}", e),
        }
    }

    // Check the Solana rust version
    println!("Checking Solana rust version...");
    let rustc_path = find_solana_rustc_path().unwrap_or_else(|| "rustc".to_string());
    let solana_rust_version = Command::new(&rustc_path)
        .arg("--version")
        .output();

    match solana_rust_version {
        Ok(output) => {
            if output.status.success() {
                println!("Solana rust version: {}", String::from_utf8_lossy(&output.stdout));
            } else {
                println!(
                    "Failed to get Solana rust version using '{}': {}",
                    rustc_path,
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        },
        Err(e) => println!("Error checking Solana rust version: {}", e),
    }

    // Print absolute paths for debugging
    println!("Using absolute paths:");
    println!("Manifest path: {}", manifest_path_str);
    println!("Deploy dir: {}", deploy_dir_str);
    println!("Shared target: {}", shared_target_str);

    // Build the args vector with absolute paths
    let mut build_args = vec![
        "build-sbf",
        "--manifest-path",
        &manifest_path_str,
        "--sbf-out-dir",
        &deploy_dir_str,
    ];

    if needs_lockfile_bump {
        println!("Adding lockfile bump flag to build args.");
        build_args.extend(["--", "-Znext-lockfile-bump"]);
    }

    println!("Executing build command with args: {:?}", build_args);
    println!("Current working directory: {:?}", std::env::current_dir()?);

    // Make sure the cargo-build-sbf command is in PATH
    let cargo_build_sbf_path = Command::new("which")
        .arg("cargo-build-sbf")
        .output();

    if let Ok(output) = cargo_build_sbf_path {
        if !output.status.success() {
            println!("cargo-build-sbf not found in PATH. This may cause build failures.");
        } else {
            println!("cargo-build-sbf found at: {}", String::from_utf8_lossy(&output.stdout));
        }
    }

    let mut child = TokioCommand::new("cargo-build-sbf")
        .args(&build_args)
        .env("CARGO_TARGET_DIR", &shared_target_str)
        .env("CARGO_HOME", &shared_cargo_home_str)  // Cache downloaded crates and registry!
        .env("CARGO_BUILD_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_CODEGEN_UNITS", "256")
        .env("RUST_LOG", "debug")
        .env("RUST_BACKTRACE", "1")
        .env("CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_DEBUG", "false")
        .env("CARGO_DEP_BYTEMUCK_DERIVE_VERSION", "1.5.0")
        .current_dir(&program_path)  // Keep this to maintain relative path resolution
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // CRITICAL: Read stdout and stderr in PARALLEL to avoid deadlock
    // If we read sequentially, the child process can hang if one buffer fills up
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_tx = output_tx.clone();
    let stderr_tx = output_tx;

    let stdout_handle = tokio::spawn(async move {
        let mut lines = String::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                println!("stdout: {}", line);
                if let Some(ref tx) = stdout_tx {
                    let _ = tx.send(line.clone()).await;
                }
                lines.push_str(&line);
                lines.push('\n');
            }
        }
        lines
    });

    let stderr_handle = tokio::spawn(async move {
        let mut lines = String::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                println!("stderr: {}", line);
                if let Some(ref tx) = stderr_tx {
                    let _ = tx.send(line.clone()).await;
                }
                lines.push_str(&line);
                lines.push('\n');
            }
        }
        lines
    });

    // Wait for both streams to complete in parallel
    let (stdout_result, stderr_result) = tokio::join!(stdout_handle, stderr_handle);
    let stdout_lines = stdout_result.unwrap_or_default();
    let mut stderr_lines = stderr_result.unwrap_or_default();

    // Wait for the command to complete
    let status = child.wait().await?;
    let build_succeeded = stdout_lines.contains("Finished release") || stderr_lines.contains("Finished release");

    // Instead of returning error, we return the stderr output along with the status
    if !status.success() && !build_succeeded {
        // Include pre-build diagnostics to help identify the source of getrandom
        if !getrandom_diag.is_empty() {
            stderr_lines.push_str(&getrandom_diag);
            stderr_lines.push('\n');
        }
        // Return the stderr output even on failure
        return Ok((stderr_lines, safe_program_name));
    }

    println!("Build command executed successfully.");

    // Check if binary was created using safe program name
    let binary_path = program_path
        .join("target/deploy")
        .join(format!("{}.so", safe_program_name));
    println!("Checking for binary at: {:?}", binary_path);

    // After successful build, upload to GCS
    if binary_path.exists() {
        println!("Binary file created successfully");
        if use_gcs() {
            let binary_data = fs::read(&binary_path)?;
            let uuid = uuid.to_string();
            let safe_program_name = safe_program_name.clone();
            let binary_data = binary_data.to_vec();
            tokio::spawn(async move {
                if let Err(e) = upload_to_gcs(&uuid, &safe_program_name, &binary_data).await {
                    eprintln!("Failed to upload binary to GCS: {}", e);
                }
            });
        }
    } else {
        println!("Warning: Binary file not found at expected location");
    }

    Ok((stderr_lines, safe_program_name))
}

async fn upload_to_gcs(uuid: &str, program_name: &str, binary_data: &[u8]) -> anyhow::Result<()> {
    if !use_gcs() {
        return Ok(());
    }

    info!("Starting GCS upload for program {} with UUID {}", program_name, uuid);
    let client = GCS_CLIENT.get_or_init(|| {
        info!("Initializing GCS client");
        Client::default()
    });

    let bucket = get_gcs_bucket();
    let object_name = format!("binaries/{}/{}.so", uuid, program_name);
    info!("Uploading to GCS bucket {} with path {}", bucket, object_name);

    client.object().create(
        &bucket,
        binary_data.to_vec(),
        &object_name,
        "application/octet-stream",
    ).await?;

    info!("Successfully uploaded program binary to GCS");
    Ok(())
}

async fn download_from_gcs(uuid: &str, program_name: &str) -> anyhow::Result<Vec<u8>> {
    let client = Client::default();

    let bucket = get_gcs_bucket();

    let object_name = format!("binaries/{}/{}.so", uuid, program_name);
    println!("Attempting to download from GCS: bucket={}, object={}", bucket, object_name);

    match client.object().download(&bucket, &object_name).await {
        Ok(data) => {
            println!("Successfully downloaded binary from GCS, size: {} bytes", data.len());
            Ok(data)
        },
        Err(e) => {
            println!("Failed to download from GCS: {}", e);
            Err(anyhow::anyhow!("Failed to download from GCS: {}", e))
        }
    }
}

pub async fn get_binary(uuid: &str, program_name: &str) -> std::io::Result<Vec<u8>> {
    let safe_program_name = program_name.replace(|c: char| !c.is_alphanumeric(), "_");
    let binary_filename = format!("{}.so", safe_program_name);

    // First try to get from the exact UUID path
    let program_path = Path::new(PROGRAMS_DIR)
        .join(uuid)
        .join("target/deploy")
        .join(&binary_filename);

    if program_path.exists() {
        println!("Reading binary from exact UUID path: {:?}", program_path);
        return fs::read(program_path).map_err(|e| {
            println!("Failed to read local binary: {}", e);
            e
        });
    }

    // If not found, try to find the binary in any project directory
    println!("Binary not found at exact UUID path, searching in all project directories");
    let programs_dir = Path::new(PROGRAMS_DIR);

    if let Ok(entries) = fs::read_dir(programs_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let potential_path = entry.path().join("target/deploy").join(&binary_filename);
                    if potential_path.exists() {
                        println!("Found binary in alternative location: {:?}", potential_path);
                        return fs::read(potential_path).map_err(|e| {
                            println!("Failed to read local binary: {}", e);
                            e
                        });
                    }
                }
            }
        }
    }

    // If still not found locally, try to get from GCS
    println!("Binary not found locally, attempting to fetch from GCS");
    download_from_gcs(uuid, &safe_program_name)
        .await
        .map_err(|e| {
            println!("Failed to download binary from GCS: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
        })
}

// Instead, create a wrapper type for binary data
#[derive(Debug)]
pub struct BinaryData(pub Vec<u8>);

impl IntoResponse for BinaryData {
    fn into_response(self) -> axum::response::Response<axum::body::Body> {
        let content_length = self.0.len().to_string();

        let mut response = axum::response::Response::new(axum::body::Body::from(self.0));
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        );
        response.headers_mut().insert(
            header::CONTENT_LENGTH,
            HeaderValue::from_str(&content_length).unwrap(),
        );
        response.headers_mut().insert(
            header::CONTENT_ENCODING,
            HeaderValue::from_static("identity"),
        );
        response
    }
}