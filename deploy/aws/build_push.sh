#!/usr/bin/env bash
set -euo pipefail

# Config
ACCOUNT_ID=${ACCOUNT_ID:-590184001652}
REGION=${REGION:-us-east-1}
REPO_NAME=${REPO_NAME:-arch-ide/rust-server}
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME"

echo "[+] Using account: $ACCOUNT_ID region: $REGION repo: $REPO_NAME"

# Ensure repo exists
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$REPO_NAME" --image-scanning-configuration scanOnPush=true --region "$REGION" >/dev/null

# Login to ECR
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Buildx for linux/amd64. Use a named, idempotent builder so successive
# script runs reuse the same buildkit cache (the unnamed `--use` form
# creates a fresh throwaway builder each invocation, defeating cache).
BUILDER_NAME=${BUILDER_NAME:-arch-ide-builder}
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER_NAME" --use >/dev/null
else
  docker buildx use "$BUILDER_NAME" >/dev/null
fi

GIT_SHA=$(git rev-parse --short HEAD)
TAGS=("latest" "$GIT_SHA")

# Prefer a file. `--secret id=...,env=` has delivered a value GitHub rejected
# from Actions, and the token must not be in the image or the task.
if [ -n "${GITHUB_TOKEN_FILE:-}" ]; then
  if [ ! -s "${GITHUB_TOKEN_FILE}" ]; then
    echo "ERROR: GITHUB_TOKEN_FILE is empty. It is used only as a BuildKit secret to prefetch arch-network." >&2
    exit 1
  fi
  SECRET="id=gh_token,src=${GITHUB_TOKEN_FILE}"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  SECRET="id=gh_token,env=GITHUB_TOKEN"
else
  echo "ERROR: GITHUB_TOKEN or GITHUB_TOKEN_FILE must be set. It is used only as a BuildKit secret to prefetch arch-network and is not pushed in the image." >&2
  exit 1
fi

ARCH_NETWORK_GIT_VAR=${ARCH_NETWORK_GIT:-https://github.com/Arch-Network/arch-network}
ARCH_NETWORK_REV_VAR=${ARCH_NETWORK_REV:-854713edfae969a86f217c1c1cdc673628faf54d}

echo "[+] Building arch-ide rust-server image for linux/amd64 (arch-network ${ARCH_NETWORK_REV_VAR})..."
docker buildx build \
  --platform linux/amd64 \
  --secret "$SECRET" \
  --build-arg "ARCH_NETWORK_GIT=${ARCH_NETWORK_GIT_VAR}" \
  --build-arg "ARCH_NETWORK_REV=${ARCH_NETWORK_REV_VAR}" \
  -t "$IMAGE_URI:latest" \
  -t "$IMAGE_URI:$GIT_SHA" \
  ./rust-server \
  --push

echo "[+] Pushed tags: ${TAGS[*]} to $IMAGE_URI"
echo "IMAGE_URI=$IMAGE_URI:$GIT_SHA"
