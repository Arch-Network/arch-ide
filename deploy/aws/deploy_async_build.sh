#!/usr/bin/env bash
set -euo pipefail

echo "===================================="
echo "Deploying Async Build System"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "rust-server" ] || [ ! -d "frontend" ]; then
  echo -e "${RED}Error: Must run from project root (arch-ide/)${NC}"
  exit 1
fi

REGION=${REGION:-us-east-1}

echo -e "${YELLOW}Step 1: Building and pushing Rust server Docker image${NC}"
echo "This will build the backend with the async build system..."
cd deploy/aws
./build_push.sh
cd ../..

echo ""
echo -e "${GREEN}✓ Backend image built and pushed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Deploying backend infrastructure updates${NC}"
echo "Updating ALB timeouts and deploying new ECS task..."
cd deploy/aws/terraform

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
  echo "Initializing Terraform..."
  terraform init
fi

echo "Planning changes..."
terraform plan -out=tfplan

echo ""
read -p "Apply these changes? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Deployment cancelled"
  exit 0
fi

terraform apply tfplan
rm tfplan

# Get ALB DNS for verification
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "unknown")

cd ../../..
echo ""
echo -e "${GREEN}✓ Backend infrastructure updated${NC}"
echo "  ALB DNS: $ALB_DNS"
echo ""

echo -e "${YELLOW}Step 3: Deploying CloudFront updates${NC}"
echo "Adding new /build/status/* route..."
cd deploy/aws/terraform-frontend

if [ ! -d ".terraform" ]; then
  echo "Initializing Terraform..."
  terraform init
fi

echo "Planning changes..."
terraform plan -out=tfplan

echo ""
read -p "Apply CloudFront changes? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "CloudFront deployment cancelled"
  exit 0
fi

terraform apply tfplan
rm tfplan

# Get outputs
BUCKET_NAME=$(terraform output -raw bucket_name 2>/dev/null)
DISTRIBUTION_ID=$(terraform output -raw distribution_id 2>/dev/null)
DISTRIBUTION_DOMAIN=$(terraform output -raw distribution_domain 2>/dev/null)

cd ../../..
echo ""
echo -e "${GREEN}✓ CloudFront updated${NC}"
echo "  Distribution: $DISTRIBUTION_ID"
echo "  Domain: $DISTRIBUTION_DOMAIN"
echo ""

echo -e "${YELLOW}Step 4: Building and deploying frontend${NC}"
echo "Updating frontend with async polling logic..."
cd deploy/aws
./sync_frontend.sh "$BUCKET_NAME" "$DISTRIBUTION_ID"
cd ../..

echo ""
echo -e "${GREEN}✓ Frontend deployed${NC}"
echo ""

echo "===================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "===================================="
echo ""
echo "Your async build system is now live at:"
echo "  https://ide.arch.network"
echo ""
echo "Backend endpoints:"
echo "  POST /build - Start async build"
echo "  GET /build/status/:uuid - Poll build status"
echo "  GET /deploy/:uuid/:program_name - Download binary"
echo ""
echo "What changed:"
echo "  ✓ Builds now run in background"
echo "  ✓ Frontend polls every 2 seconds"
echo "  ✓ No more 504 timeouts"
echo "  ✓ Real-time progress updates"
echo ""
echo "Test it:"
echo "  1. Open https://ide.arch.network"
echo "  2. Create/open a project"
echo "  3. Click 'Build'"
echo "  4. Watch the progress updates in the output panel"
echo ""
