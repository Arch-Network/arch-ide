#!/bin/bash
# Prefetch Arch-Network/arch-network at a pinned commit and vendor the user
# program's crates.io closure.
#
# The GitHub token is read from a BuildKit secret file during `fetch` only.
# It is never written to git config, an image layer, or an environment
# variable of the runtime task. `vendor` does not mount the secret.
set -euo pipefail

ARCH_SDK_ROOT="${ARCH_SDK_ROOT:-/opt/arch-sdk}"
CARGO_VENDOR_DIR="${CARGO_VENDOR_DIR:-/opt/cargo-vendor}"
ARCH_CARGO_HOME="${ARCH_CARGO_HOME:-/opt/cargo-home}"
ARCH_NETWORK_GIT="${ARCH_NETWORK_GIT:-https://github.com/Arch-Network/arch-network}"
ARCH_NETWORK_REV="${ARCH_NETWORK_REV:-854713edfae969a86f217c1c1cdc673628faf54d}"
GH_TOKEN_FILE="${GH_TOKEN_FILE:-/run/secrets/gh_token}"

usage() {
    echo "usage: prefetch-arch-sdk.sh fetch|vendor" >&2
    exit 2
}

reject_credentialed_url() {
    case "$ARCH_NETWORK_GIT" in
        *x-oauth-basic*|*@github.com*)
            echo "ARCH_NETWORK_GIT must not embed credentials: use a BuildKit secret" >&2
            exit 1
            ;;
    esac
}

scan_tree() {
    local root="$1"
    if [ ! -e "$root" ]; then
        return 0
    fi
    local status=0
    grep -R -I -E -q \
        'x-oauth-basic|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|https?://[^[:space:]/]+@github.com' \
        "$root" || status=$?
    if [ "$status" -eq 0 ]; then
        echo "credential material found under $root; refusing to keep this image layer" >&2
        exit 1
    fi
    if [ "$status" -gt 1 ]; then
        echo "failed to scan $root for credential material (grep status ${status})" >&2
        exit 1
    fi
}

cmd_fetch() {
    reject_credentialed_url
    local want
    want="$(printf '%s' "$ARCH_NETWORK_REV" | tr '[:upper:]' '[:lower:]')"
    if ! printf '%s' "$want" | grep -Eq '^[0-9a-f]{40}$'; then
        echo "ARCH_NETWORK_REV must be a 40-character commit SHA (got '${ARCH_NETWORK_REV}')" >&2
        exit 1
    fi
    if [ ! -s "$GH_TOKEN_FILE" ]; then
        echo "missing BuildKit secret file ${GH_TOKEN_FILE} (docker build --secret id=gh_token,env=GITHUB_TOKEN)" >&2
        exit 1
    fi

    # Not local: the EXIT trap runs after this function returns, and a local
    # would already be gone. `set -u` then fails the build after a good fetch.
    helper="$(mktemp)"
    # The helper reads the secret file when git asks for a password. The token
    # is not in argv, the URL, or git config. The helper itself is deleted
    # before this script exits, and it contains no secret bytes.
    cat > "$helper" << EOF
#!/bin/sh
case "\$1" in
  get)
    printf '%s\n' 'username=x-access-token'
    printf 'password='
    tr -d '[:space:]' < '${GH_TOKEN_FILE}'
    printf '\n'
    ;;
esac
EOF
    chmod 700 "$helper"
    cleanup() {
        if [ -n "${helper:-}" ]; then
            rm -f "$helper"
        fi
        rm -f /root/.gitconfig /root/.git-credentials
    }
    trap cleanup EXIT

    rm -rf "$ARCH_SDK_ROOT"
    mkdir -p "$ARCH_SDK_ROOT"
    git init "$ARCH_SDK_ROOT"
    git -C "$ARCH_SDK_ROOT" remote add origin "$ARCH_NETWORK_GIT"

    GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null \
    git -C "$ARCH_SDK_ROOT" \
        -c credential.helper= \
        -c "credential.helper=${helper}" \
        fetch --depth 1 origin "$want"
    git -C "$ARCH_SDK_ROOT" checkout --detach FETCH_HEAD

    local got
    got="$(git -C "$ARCH_SDK_ROOT" rev-parse HEAD)"
    if [ "$got" != "$want" ]; then
        echo "checked out ${got}, wanted ${want}" >&2
        exit 1
    fi

    # Drop the git dir in this same layer so the remote and any credential
    # helper path cannot survive into the image.
    rm -rf "$ARCH_SDK_ROOT/.git"
    printf '%s\n' "$want" > "$ARCH_SDK_ROOT/REVISION"
    scan_tree "$ARCH_SDK_ROOT"
    if [ -e "$ARCH_SDK_ROOT/.git" ] || [ -e /root/.gitconfig ] || [ -e /root/.git-credentials ]; then
        echo "git metadata survived the SDK fetch" >&2
        exit 1
    fi
}

cmd_vendor() {
    if [ ! -f "$ARCH_SDK_ROOT/program/Cargo.toml" ]; then
        echo "SDK checkout missing at ${ARCH_SDK_ROOT}; run fetch first" >&2
        exit 1
    fi
    local manifest="/tmp/sdk-vendor/Cargo.toml"
    if [ ! -f "$manifest" ]; then
        echo "missing ${manifest}" >&2
        exit 1
    fi
    if [ "$ARCH_SDK_ROOT" != "/opt/arch-sdk" ]; then
        sed -i "s#/opt/arch-sdk#${ARCH_SDK_ROOT}#g" "$manifest"
    fi

    mkdir -p "$ARCH_CARGO_HOME" "$CARGO_VENDOR_DIR"
    local fetch_home
    fetch_home="$(mktemp -d)"
    CARGO_HOME="$fetch_home" \
    CARGO_NET_GIT_FETCH_WITH_CLI=false \
        cargo fetch --manifest-path "$manifest" --features idl-build
    CARGO_HOME="$fetch_home" \
    CARGO_NET_GIT_FETCH_WITH_CLI=false \
        cargo vendor --manifest-path "$manifest" --versioned-dirs "$CARGO_VENDOR_DIR" \
        > "$ARCH_CARGO_HOME/config.toml"
    cat >> "$ARCH_CARGO_HOME/config.toml" << 'EOF'

[net]
offline = true
git-fetch-with-cli = false
EOF
    # Resolve the same manifest users will build, against the vendor dir only.
    # This fails the image build if a crate is missing or unreadable by this
    # cargo, instead of failing the first user compile.
    CARGO_HOME="$ARCH_CARGO_HOME" \
    CARGO_NET_OFFLINE=true \
    CARGO_NET_GIT_FETCH_WITH_CLI=false \
        cargo metadata --offline --manifest-path "$manifest" --features idl-build --format-version 1 \
        >/dev/null
    rm -rf "$fetch_home" /tmp/sdk-vendor/target
    if ! grep -q 'offline = true' "$ARCH_CARGO_HOME/config.toml"; then
        echo "vendor config is missing [net] offline" >&2
        exit 1
    fi
    if ! grep -q 'replace-with = "vendored-sources"' "$ARCH_CARGO_HOME/config.toml"; then
        echo "vendor config is missing the crates.io replacement" >&2
        exit 1
    fi
    scan_tree "$ARCH_CARGO_HOME"
    scan_tree "$CARGO_VENDOR_DIR"
}

case "${1:-}" in
    fetch) cmd_fetch ;;
    vendor) cmd_vendor ;;
    *) usage ;;
esac
