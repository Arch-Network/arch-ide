use std::{env, path::Path};

/// `LD_PRELOAD` library that rejects connections to the EC2 metadata service
/// and the ECS task credential endpoint. Absent outside the production image,
/// in which case the compile sandbox still unsets credential environment
/// variables and the task role stays empty.
pub fn preload_path() -> Option<String> {
    let path = env::var("LINK_LOCAL_BLOCK_LIB")
        .unwrap_or_else(|_| "/usr/local/lib/libblock_link_local.so".to_string());
    if Path::new(&path).is_file() {
        Some(path)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::process::Command;

    #[test]
    fn preload_blocks_metadata_and_ecs_credential_endpoints() {
        if Command::new("cc").arg("--version").output().is_err() {
            eprintln!("skipping link-local preload test: cc is not installed");
            return;
        }

        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let source = manifest_dir.join("sandbox/block_link_local.c");
        let dir = std::env::temp_dir().join(format!(
            "arch-ide-link-local-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let lib = dir.join(if cfg!(target_os = "macos") {
            "libblock.dylib"
        } else {
            "libblock.so"
        });
        let lib_status = Command::new("cc")
            .args(["-shared", "-fPIC", "-o"])
            .arg(&lib)
            .arg(&source)
            .status()
            .expect("compile preload library");
        assert!(lib_status.success(), "cc failed to build {source:?}");

        let checker_src = dir.join("checker.c");
        std::fs::write(
            &checker_src,
            r#"
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static int connect_to(const char *ip) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(80);
    inet_pton(AF_INET, ip, &addr.sin_addr);
    alarm(2);
    int rc = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
    int err = errno;
    close(fd);
    if (rc == 0) return 0;
    return err;
}

int main(void) {
    int metadata = connect_to("169.254.169.254");
    int ecs = connect_to("169.254.170.2");
    int local = connect_to("127.0.0.1");
    /* EPERM is 1 on Linux and macOS. A non-metadata address must not be EPERM. */
    if (metadata != 1 || ecs != 1) {
        fprintf(stderr, "metadata=%d ecs=%d local=%d\n", metadata, ecs, local);
        return 1;
    }
    if (local == 1) {
        fprintf(stderr, "preload blocked a non-metadata address (local=%d)\n", local);
        return 2;
    }
    return 0;
}
"#,
        )
        .unwrap();

        let checker = dir.join("checker");
        let checker_status = Command::new("cc")
            .arg("-o")
            .arg(&checker)
            .arg(&checker_src)
            .status()
            .expect("compile checker");
        assert!(checker_status.success(), "cc failed to build checker");

        let mut run = Command::new(&checker);
        if cfg!(target_os = "macos") {
            run.env("DYLD_INSERT_LIBRARIES", &lib)
                .env("DYLD_FORCE_FLAT_NAMESPACE", "1");
        } else {
            run.env("LD_PRELOAD", &lib);
        }
        let output = run.output().expect("run checker");
        assert!(
            output.status.success(),
            "metadata endpoints were not blocked\nstdout:{}\nstderr:{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
