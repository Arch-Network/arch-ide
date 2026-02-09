FROM ubuntu:22.04 AS development

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"
ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

# Install build deps and development tools
RUN apt-get update -qq && apt-get upgrade -qq && \
    apt-get install -qq apt-utils && \
    dpkg --add-architecture i386 && \
    apt-get update -qq && \
    apt-get install -qq \
    build-essential \
    curl \
    ca-certificates \
    bzip2 \
    pkg-config \
    libssl-dev \
    libudev-dev \
    gcc-multilib \
    libc6-dev-i386 \
    git \
    vim

# Install Rust with specific toolchain and verify installation
# Keep this aligned with arch-network's recommended toolchain for cargo-build-sbf.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.84.1 && \
    echo 'source "$HOME/.cargo/env"' >> ~/.bashrc && \
    /bin/bash -c "source $HOME/.cargo/env && \
    cargo --version && \
    rustc --version"

# Install Solana (installer method for 2.2.x)
ARG SOLANA_VERSION="2.2.14"
RUN set -e; \
    curl --retry 5 --retry-all-errors --retry-delay 3 --http1.1 -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install -o /tmp/install.sh && \
    sh /tmp/install.sh && \
    ln -sf /root/.local/share/solana/install/active_release/bin /usr/local/solana && \
    ln -sf /usr/local/solana/solana /usr/local/bin/solana && \
    ln -sf /usr/local/solana/cargo-build-sbf /usr/local/bin/cargo-build-sbf
ENV PATH="/usr/local/solana:${PATH}"

WORKDIR /app

# Verify installations
RUN echo "Verifying installations..." && \
    cargo --version && \
    rustc --version && \
    solana --version

# Base layer with OS and tools
FROM ubuntu:22.04 AS base

# Install common dependencies
RUN apt-get update -qq && \
    apt-get install -qq apt-utils && \
    dpkg --add-architecture i386 && \
    apt-get update -qq && \
    apt-get install -qq \
    build-essential curl ca-certificates bzip2 pkg-config libssl-dev \
    libudev-dev gcc-multilib libc6-dev-i386 git vim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install Rust toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.84.1
ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

# Install Solana (installer method for 2.2.x)
ARG SOLANA_VERSION="2.2.14"
RUN set -e; \
    curl --retry 5 --retry-all-errors --retry-delay 3 --http1.1 -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install -o /tmp/install.sh && \
    sh /tmp/install.sh && \
    ln -sf /root/.local/share/solana/install/active_release/bin /usr/local/solana && \
    ln -sf /usr/local/solana/solana /usr/local/bin/solana && \
    ln -sf /usr/local/solana/cargo-build-sbf /usr/local/bin/cargo-build-sbf
ENV PATH="/usr/local/solana:${PATH}"

# Verify installations in base image
RUN echo "Verifying base image installations..." && \
    cargo --version && \
    rustc --version && \
    /usr/local/bin/solana --version && \
    /usr/local/bin/cargo-build-sbf --version

# Prefetch Solana platform-tools + link rustup 'solana' toolchain during image build.
# This avoids first-request races in production where multiple concurrent builds (e.g. warmup + user build)
# can partially download/extract platform-tools and cause "not a directory .../platform-tools/rust/bin".
# It's OK if the dummy build fails after toolchain setup; we only care that the toolchain is installed.
RUN set -e; \
    mkdir -p /tmp/sbf-prefetch/src; \
    printf '%s\n' \
      '[package]' \
      'name = "sbf_prefetch"' \
      'version = "0.1.0"' \
      'edition = "2021"' \
      '' \
      '[lib]' \
      'crate-type = ["cdylib"]' \
      '' \
      '[dependencies]' \
      > /tmp/sbf-prefetch/Cargo.toml; \
    printf '%s\n' \
      '#![no_std]' \
      '' \
      '// Intentionally minimal; this may fail later due to missing panic handler, but' \
      '// cargo-build-sbf will have already downloaded platform-tools and linked the toolchain.' \
      '#[no_mangle]' \
      'pub extern "C" fn entrypoint() {}' \
      > /tmp/sbf-prefetch/src/lib.rs; \
    cargo build-sbf --manifest-path /tmp/sbf-prefetch/Cargo.toml --sbf-out-dir /tmp/sbf-prefetch/target/deploy || true; \
    rm -rf /tmp/sbf-prefetch

# Create a separate stage for dependencies
FROM base AS cargo-deps
WORKDIR /app
COPY Cargo.toml ./
RUN touch Cargo.lock
COPY Cargo.lock ./
# Create minimal src directory with dummy main.rs
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
# Fetch all dependencies
RUN cargo fetch

# Development image with cached dependencies
FROM base AS dev-cached
WORKDIR /app
# Development-specific setup would go here

# Builder stage - uses the cached dependencies
FROM cargo-deps AS builder
WORKDIR /app
COPY Cargo.toml ./
RUN touch Cargo.lock
COPY Cargo.lock ./
# Copy the actual source code
COPY src ./src
COPY programs ./programs
# Build the release binary
RUN cargo build --release
# Fetch all dependencies
RUN cargo fetch

# Production stage - final lightweight image
FROM base AS production
WORKDIR /app

# Copy the binary and create programs directory structure
COPY --from=builder /app/target/release/arch-server /usr/local/bin/
RUN mkdir -p /app/programs && chmod -R 777 /app/programs

# Copy programs directory if it exists in the build context
COPY programs /app/programs/

# Ensure proper permissions
RUN chmod -R 777 /app/programs

# Copy Rust installations from base
COPY --from=base /root/.cargo /root/.cargo
COPY --from=base /root/.rustup /root/.rustup

# Create necessary directories with proper permissions
RUN mkdir -p /app/programs/target/deploy && \
    # Fix permissions - make sure all directories are accessible
    chmod -R 755 /app && \
    chmod -R 755 /root/.cargo && \
    chmod -R 755 /usr/local/solana && \
    chmod +x /usr/local/bin/arch-server

# Set environment variables
ENV PORT=8080
ENV RUST_LOG=info
ENV PATH="/root/.cargo/bin:/usr/local/solana:${PATH}"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

# Verify installations in production image
RUN echo "Verifying production image installations..." && \
    cargo --version && \
    rustc --version && \
    /usr/local/bin/solana --version && \
    /usr/local/bin/cargo-build-sbf --version && \
    ls -la /root/.cargo/bin

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Run as root for now to avoid permission issues
# USER appuser

# Create a startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting server with enhanced directory setup..."\n\
\n\
# -----------------------------------------------------------------------------\n\
# Git auth for private dependencies (arch-network)\n\
# -----------------------------------------------------------------------------\n\
# Cargo uses libgit2 by default, which often cannot use your usual credential helpers.\n\
# Force cargo to use the git CLI, which can authenticate via token/credential helpers.\n\
mkdir -p /root/.cargo\n\
cat > /root/.cargo/config.toml <<EOF\n\
[net]\n\
git-fetch-with-cli = true\n\
EOF\n\
\n\
# If a GitHub token is provided, configure git to transparently authenticate\n\
# github.com HTTPS clones. This is required if arch-network is private.\n\
if [ -n "${GITHUB_TOKEN:-}" ]; then\n\
  git config --global url."https://${GITHUB_TOKEN}:x-oauth-basic@github.com/".insteadOf "https://github.com/"\n\
fi\n\
\n\
mkdir -p /app/programs\n\
chmod -R 777 /app/programs\n\
# Create a test directory to verify permissions\n\
TEST_UUID="test-uuid"\n\
mkdir -p /app/programs/${TEST_UUID}/src\n\
echo "[package]\nname = \"test\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n" > /app/programs/${TEST_UUID}/Cargo.toml\n\
echo "Directory structure verified at startup:"\n\
ls -la /app/programs\n\
ls -la /app/programs/${TEST_UUID}\n\
echo "PATH: $PATH"\n\
echo "Checking for cargo-build-sbf:"\n\
which cargo-build-sbf || echo "cargo-build-sbf not found"\n\
exec "$@"' > /usr/local/bin/startup.sh && \
chmod +x /usr/local/bin/startup.sh

# Change the CMD to use the startup script
CMD ["/usr/local/bin/startup.sh", "/usr/local/bin/arch-server"]
