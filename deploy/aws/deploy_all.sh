#!/usr/bin/env bash
set -euo pipefail

# Configuration
ACCOUNT_ID=${ACCOUNT_ID:-590184001652}
REGION=${REGION:-us-east-1}
REPO_NAME=${REPO_NAME:-arch-ide/rust-server}
ALB_NAME=${ALB_NAME:-arch-ide-alb}
ECS_CLUSTER="arch-ide-cluster"
ECS_SERVICE="arch-ide-server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

get_alb_dns() {
    # Try Terraform output first (fast path when state is available)
    local dns=""
    dns=$(terraform -chdir=deploy/aws/terraform output -raw alb_dns_name 2>/dev/null || echo "")
    # Terraform can print warnings to stdout when state/outputs are missing; treat that as invalid.
    if [ -n "$dns" ] && [[ "$dns" != *"Warning:"* ]] && [[ "$dns" != *"No outputs found"* ]] && [[ "$dns" != *"╷"* ]]; then
        echo "$dns"
        return 0
    fi

    # Fallback: query AWS directly by ALB name
    dns=$(aws elbv2 describe-load-balancers \
        --names "$ALB_NAME" \
        --region "$REGION" \
        --query 'LoadBalancers[0].DNSName' \
        --output text 2>/dev/null || echo "")
    if [ -n "$dns" ] && [ "$dns" != "None" ]; then
        echo "$dns"
        return 0
    fi

    echo ""
    return 0
}

# GITHUB_TOKEN is consumed only as a BuildKit secret while the image is built.
# It is not passed to Terraform and not injected into the ECS task.

# Parse command line arguments
SKIP_BACKEND=false
SKIP_FRONTEND=false
SKIP_WAIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-backend)
            SKIP_BACKEND=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --skip-wait)
            SKIP_WAIT=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-backend    Skip backend deployment"
            echo "  --skip-frontend   Skip frontend deployment"
            echo "  --skip-wait       Don't wait for ECS service to stabilize"
            echo "  --help            Show this help message"
            echo ""
            echo "GITHUB_TOKEN must be set in the environment. It is used only to prefetch"
            echo "Arch-Network/arch-network while building the image, and is not deployed."
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Change to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

log_info "Starting deployment from: $PROJECT_ROOT"
log_info "Account: $ACCOUNT_ID | Region: $REGION"

# =============================================================================
# BACKEND DEPLOYMENT
# =============================================================================
if [ "$SKIP_BACKEND" = false ]; then
    log_info "========================================="
    log_info "STEP 1: Building and pushing Rust server"
    log_info "========================================="

    # Build and push Docker image
    IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME"
    IMAGE_URI_LATEST="$IMAGE_URI:latest"

    log_info "Ensuring ECR repository exists..."
    aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 || \
        aws ecr create-repository --repository-name "$REPO_NAME" --image-scanning-configuration scanOnPush=true --region "$REGION" >/dev/null

    log_info "Logging in to ECR..."
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

    # Get git commit hash
    GIT_SHA=$(git rev-parse --short HEAD)

    if [ -z "${GITHUB_TOKEN:-}" ]; then
        log_error "GITHUB_TOKEN must be set to prefetch private arch-network crates during the image build."
        log_error "It is passed as a BuildKit secret and is not stored in the image or the ECS task."
        exit 1
    fi

    # Pin baked into the image. Keep this in lockstep with the task env below.
    ARCH_NETWORK_GIT_VAR=${ARCH_NETWORK_GIT:-https://github.com/Arch-Network/arch-network}
    ARCH_NETWORK_REV_VAR=${ARCH_NETWORK_REV:-854713edfae969a86f217c1c1cdc673628faf54d}
    ARCH_NETWORK_BRANCH_VAR=${ARCH_NETWORK_BRANCH:-""}

    log_info "Building Docker image for linux/amd64 (arch-network ${ARCH_NETWORK_REV_VAR})..."
    docker buildx create --use >/dev/null 2>&1 || true
    docker buildx build \
        --platform linux/amd64 \
        --secret id=gh_token,env=GITHUB_TOKEN \
        --build-arg "ARCH_NETWORK_GIT=${ARCH_NETWORK_GIT_VAR}" \
        --build-arg "ARCH_NETWORK_REV=${ARCH_NETWORK_REV_VAR}" \
        -t "$IMAGE_URI:latest" \
        -t "$IMAGE_URI:$GIT_SHA" \
        ./rust-server \
        --push

    log_info "✓ Pushed tags: latest, $GIT_SHA to $IMAGE_URI"

    log_info "========================================="
    log_info "STEP 2: Updating ECS service"
    log_info "========================================="

    # Update Terraform to ensure task definition uses latest image
    log_info "Applying Terraform configuration..."
    # The pin was applied as a Docker build-arg above. Repeat it as task env so
    # the server can warn if the image and the task disagree. No GitHub token
    # is injected.

    TF_ARGS=(
        -var "rust_server_image=$IMAGE_URI:latest"
    )
    if [ -n "$ARCH_NETWORK_GIT_VAR" ]; then
        TF_ARGS+=(-var "arch_network_git=$ARCH_NETWORK_GIT_VAR")
    fi
    if [ -n "$ARCH_NETWORK_REV_VAR" ]; then
        TF_ARGS+=(-var "arch_network_rev=$ARCH_NETWORK_REV_VAR")
    fi
    if [ -n "$ARCH_NETWORK_BRANCH_VAR" ]; then
        TF_ARGS+=(-var "arch_network_branch=$ARCH_NETWORK_BRANCH_VAR")
    fi

    # Terraform can fail if state is missing/drifted and infra already exists (common in AWS accounts
    # where VPC limits are hit or resources were created in a different state/backend).
    # In those cases, fall back to an ECS-only task definition update.
    TF_LOG_FILE="$(mktemp -t arch-ide-tf.XXXXXX.log)"
    set +e
    terraform -chdir=deploy/aws/terraform apply -auto-approve "${TF_ARGS[@]}" >"$TF_LOG_FILE" 2>&1
    TF_EXIT=$?
    set -e

    if [ $TF_EXIT -ne 0 ]; then
        log_warn "Terraform apply failed (exit=$TF_EXIT). Checking if this is a known 'already exists / limits' case..."
        if grep -qE "VpcLimitExceeded|ResourceAlreadyExistsException|EntityAlreadyExists" "$TF_LOG_FILE"; then
            log_warn "Detected existing infra / account limits. Falling back to ECS-only task definition update."
            export REGION="$REGION"
            export ECS_CLUSTER="$ECS_CLUSTER"
            export ECS_SERVICE="$ECS_SERVICE"
            export IMAGE_URI="$IMAGE_URI_LATEST"
            export ARCH_NETWORK_GIT="$ARCH_NETWORK_GIT_VAR"
            export ARCH_NETWORK_REV="$ARCH_NETWORK_REV_VAR"
            export ARCH_NETWORK_BRANCH="$ARCH_NETWORK_BRANCH_VAR"
            unset GITHUB_TOKEN_SECRET_ARN

            NEW_TASK_DEF_ARN=$(python3 deploy/aws/update_ecs_task_definition.py)
            log_info "✓ Registered and deployed new task definition: $NEW_TASK_DEF_ARN"
        else
            log_error "Terraform apply failed. Full output:"
            cat "$TF_LOG_FILE"
            exit $TF_EXIT
        fi
    else
        log_info "✓ Terraform apply complete"
    fi
    rm -f "$TF_LOG_FILE"

    # Force new deployment
    log_info "Forcing new ECS deployment..."
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$ECS_SERVICE" \
        --force-new-deployment \
        --region "$REGION" >/dev/null

    log_info "✓ ECS deployment initiated"

    if [ "$SKIP_WAIT" = false ]; then
        log_info "Waiting for ECS service to stabilize (this may take 2-3 minutes)..."
        aws ecs wait services-stable \
            --cluster "$ECS_CLUSTER" \
            --services "$ECS_SERVICE" \
            --region "$REGION"
        log_info "✓ ECS service is stable"
    else
        log_warn "Skipping wait for ECS stabilization"
    fi
else
    log_warn "Skipping backend deployment"
fi

# =============================================================================
# FRONTEND DEPLOYMENT
# =============================================================================
if [ "$SKIP_FRONTEND" = false ]; then
    log_info "========================================="
    log_info "STEP 3: Building and deploying frontend"
    log_info "========================================="

    # Get ALB DNS name for API endpoint
    log_info "Fetching ALB DNS name..."
    ALB_DNS=$(terraform -chdir=deploy/aws/terraform output -raw alb_dns_name 2>/dev/null || echo "")

    if [ -z "$ALB_DNS" ]; then
        log_error "Could not retrieve ALB DNS name from Terraform"
        exit 1
    fi

    log_info "ALB DNS: $ALB_DNS"

    # Get CloudFront distribution ID and S3 bucket name
    log_info "Fetching CloudFront distribution ID..."
    CLOUDFRONT_DIST_ID=$(terraform -chdir=deploy/aws/terraform-frontend output -raw distribution_id 2>/dev/null || echo "")

    if [ -z "$CLOUDFRONT_DIST_ID" ]; then
        log_error "Could not retrieve CloudFront distribution ID from Terraform"
        log_error "Make sure terraform-frontend has been applied"
        exit 1
    fi

    log_info "CloudFront Distribution: $CLOUDFRONT_DIST_ID"

    # Get S3 bucket name from Terraform
    log_info "Fetching S3 bucket name..."
    FRONTEND_BUCKET=$(terraform -chdir=deploy/aws/terraform-frontend output -raw bucket_name 2>/dev/null || echo "")

    if [ -z "$FRONTEND_BUCKET" ]; then
        log_error "Could not retrieve S3 bucket name from Terraform"
        exit 1
    fi

    log_info "S3 Bucket: $FRONTEND_BUCKET"

    # Build frontend with API URL pointing to production domain (CloudFront -> ALB)
    log_info "Building frontend with VITE_API_URL=https://ide.arch.network..."
    cd frontend
    VITE_API_URL=https://ide.arch.network npm run build
    cd ..

    log_info "✓ Frontend build complete"

    # Sync to S3
    log_info "Syncing frontend to S3 bucket: $FRONTEND_BUCKET..."
    aws s3 sync \
        frontend/dist/ \
        "s3://$FRONTEND_BUCKET/" \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*.html" \
        --region "$REGION"

    # Sync HTML files separately with shorter cache
    aws s3 sync \
        frontend/dist/ \
        "s3://$FRONTEND_BUCKET/" \
        --cache-control "public, max-age=0, must-revalidate" \
        --exclude "*" \
        --include "*.html" \
        --region "$REGION"

    log_info "✓ Frontend synced to S3"

    # Invalidate CloudFront cache
    log_info "Creating CloudFront invalidation..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DIST_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)

    log_info "✓ CloudFront invalidation created: $INVALIDATION_ID"
    log_info "Waiting for invalidation to complete..."

    aws cloudfront wait invalidation-completed \
        --distribution-id "$CLOUDFRONT_DIST_ID" \
        --id "$INVALIDATION_ID"

    log_info "✓ CloudFront cache invalidated"
else
    log_warn "Skipping frontend deployment"
fi

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================
log_info "========================================="
log_info "DEPLOYMENT COMPLETE"
log_info "========================================="

if [ "$SKIP_BACKEND" = false ]; then
    log_info "Backend:"
    log_info "  • Image: $IMAGE_URI:$GIT_SHA"
    log_info "  • ECS Cluster: $ECS_CLUSTER"
    log_info "  • ECS Service: $ECS_SERVICE"
    ALB_DNS="$(get_alb_dns)"
    if [ -n "$ALB_DNS" ]; then
        log_info "  • API Endpoint: http://$ALB_DNS"
    else
        log_warn "  • API Endpoint: <unknown> (ALB DNS not found)"
    fi
fi

if [ "$SKIP_FRONTEND" = false ]; then
    log_info "Frontend:"
    log_info "  • S3 Bucket: $FRONTEND_BUCKET"
    log_info "  • CloudFront: $CLOUDFRONT_DIST_ID"
    log_info "  • URL: https://ide.arch.network"
fi

log_info ""
log_info "✓ All deployments successful!"
