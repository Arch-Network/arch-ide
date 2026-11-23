use std::sync::OnceLock;

use regex::Regex;

/// Strip credential material from compiler output before it is logged or
/// returned to the caller.
///
/// A git `insteadOf` rewrite of the form
/// `https://<token>:x-oauth-basic@github.com/` used to be printed by cargo
/// whenever a fetch failed. The compile sandbox no longer carries a token;
/// this is the backstop for a config regression and for any other secret
/// that shows up in a build log.
pub fn redact_secrets(input: &str) -> String {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        // URL first, so a credentialed GitHub URL is removed in one pass
        // rather than leaving `https://[REDACTED]@github.com` behind.
        [
            r"https?://[^\s/]+@github\.com",
            r"github_pat_[A-Za-z0-9_]+",
            r"ghp_[A-Za-z0-9]+",
            r"gho_[A-Za-z0-9]+",
            r"ghs_[A-Za-z0-9]+",
            r"x-oauth-basic",
        ]
        .into_iter()
        .map(|pattern| Regex::new(pattern).expect("redaction pattern"))
        .collect()
    });

    let mut out = input.to_string();
    for pattern in patterns {
        out = pattern.replace_all(&out, "[REDACTED]").into_owned();
    }
    out
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::redact_secrets;
    use regex::Regex;

    #[test]
    fn redacts_each_token_pattern() {
        let samples = [
            "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "gho_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            "ghs_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            "x-oauth-basic",
            "https://ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:x-oauth-basic@github.com/Arch-Network/arch-network",
            "http://gho_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB@github.com/Arch-Network/arch-network",
        ];
        for sample in samples {
            let redacted = redact_secrets(sample);
            assert!(!redacted.contains("ghp_"), "{redacted}");
            assert!(!redacted.contains("github_pat_"), "{redacted}");
            assert!(!redacted.contains("gho_"), "{redacted}");
            assert!(!redacted.contains("ghs_"), "{redacted}");
            assert!(!redacted.contains("x-oauth-basic"), "{redacted}");
            assert!(
                !Regex::new(r"https?://[^\s/]+@github\.com")
                    .unwrap()
                    .is_match(&redacted),
                "{redacted}"
            );
            assert!(redacted.contains("[REDACTED]"));
        }
    }

    #[test]
    fn leaves_ordinary_compiler_output_alone() {
        let line = "error[E0425]: cannot find value `foo` in this scope";
        assert_eq!(redact_secrets(line), line);
    }

    /// A failing git fetch used to echo the rewritten `insteadOf` URL, token
    /// and all, into the log we return to the user. The build path stores and
    /// prints compiler output only after [`redact_secrets`].
    #[test]
    fn failing_git_fetch_does_not_print_a_token() {
        let token = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        let url = format!("https://{token}:x-oauth-basic@github.com/Arch-Network/arch-network");

        let output = Command::new("git")
            .args(["-c", "http.proxy=http://127.0.0.1:9", "ls-remote", &url])
            .env("GIT_TERMINAL_PROMPT", "0")
            .env_remove("GITHUB_TOKEN")
            .output()
            .expect("git is required for the fetch-redaction regression");

        assert!(
            !output.status.success(),
            "the regression fetch must fail, not reach GitHub"
        );

        // Cargo's historical failure text included the credentialed URL even
        // when git itself censored its own stderr. Keep that line in the
        // fixture so the test fails if redaction stops covering it.
        let raw = format!(
            "{}\n{}\nerror: failed to load source for dependency `arch_program`\n\nCaused by:\n  Unable to update {url}\n",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
        assert!(
            raw.contains(token),
            "fixture must contain the token before redaction"
        );

        let redacted = redact_secrets(&raw);
        assert!(!redacted.contains(token), "{redacted}");
        assert!(!redacted.contains("x-oauth-basic"), "{redacted}");
        assert!(!redacted.contains("ghp_"), "{redacted}");
        assert!(
            !Regex::new(r"https?://[^\s/]+@github\.com")
                .unwrap()
                .is_match(&redacted),
            "{redacted}"
        );

        let git_stderr = redact_secrets(&String::from_utf8_lossy(&output.stderr));
        assert!(!git_stderr.contains(token), "{git_stderr}");
        assert!(!git_stderr.contains("x-oauth-basic"), "{git_stderr}");
    }
}
