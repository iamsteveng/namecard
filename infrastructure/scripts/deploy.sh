#!/bin/bash

# NameCard CDK Deployment Script
# Usage: ./scripts/deploy.sh [environment] [aws-profile]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-development}
AWS_PROFILE=${2:-default}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="$(dirname "$SCRIPT_DIR")"

# Validate environment
case $ENVIRONMENT in
  development|staging|production)
    echo -e "${GREEN}✓ Valid environment: $ENVIRONMENT${NC}"
    ;;
  *)
    echo -e "${RED}✗ Invalid environment: $ENVIRONMENT${NC}"
    echo "Valid environments: development, staging, production"
    exit 1
    ;;
esac

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  NameCard CDK Deployment${NC}"
echo -e "${BLUE}=====================================${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "AWS Profile: ${YELLOW}$AWS_PROFILE${NC}"
echo -e "CDK Directory: ${YELLOW}$CDK_DIR${NC}"
echo -e "${BLUE}=====================================${NC}"

cd "$CDK_DIR"

# Set AWS profile if provided
if [ "$AWS_PROFILE" != "default" ]; then
  export AWS_PROFILE="$AWS_PROFILE"
  echo -e "${YELLOW}Using AWS profile: $AWS_PROFILE${NC}"
fi

# Check AWS credentials
echo -e "${BLUE}Checking AWS credentials...${NC}"
aws sts get-caller-identity > /dev/null || {
  echo -e "${RED}✗ AWS credentials not configured or expired${NC}"
  echo "Please configure AWS credentials using:"
  echo "  aws configure --profile $AWS_PROFILE"
  echo "or"
  echo "  export AWS_ACCESS_KEY_ID=your-access-key"
  echo "  export AWS_SECRET_ACCESS_KEY=your-secret-key"
  exit 1
}

echo -e "${GREEN}✓ AWS credentials verified${NC}"

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Build the CDK app
echo -e "${BLUE}Building CDK application...${NC}"
npm run build

# Bootstrap CDK (if needed)
echo -e "${BLUE}Checking CDK bootstrap status...${NC}"
npm run bootstrap || {
  echo -e "${YELLOW}Bootstrapping CDK environment...${NC}"
  npm run bootstrap
}

# Synthesize the template
echo -e "${BLUE}Synthesizing CloudFormation template...${NC}"
npm run synth -- --context environment="$ENVIRONMENT"

# Show the diff (what will be deployed)
echo -e "${BLUE}Showing deployment diff...${NC}"
npm run diff -- --context environment="$ENVIRONMENT" || true

# Confirm deployment
if [ "$ENVIRONMENT" = "production" ]; then
  echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
  read -p "Are you sure you want to continue? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
  fi
fi

# Deploy the stacks
echo -e "${BLUE}Deploying CDK stacks...${NC}"
npm run deploy -- --context environment="$ENVIRONMENT" --require-approval never

# Get outputs
echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${BLUE}=====================================${NC}"

# Show stack outputs
echo -e "${BLUE}Stack Outputs:${NC}"
aws cloudformation describe-stacks \
  --stack-name "NameCardInfra-$ENVIRONMENT" \
  --query 'Stacks[0].Outputs[?OutputKey].{Key:OutputKey,Value:OutputValue,Description:Description}' \
  --output table 2>/dev/null || echo "Could not retrieve stack outputs"

echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN}Deployment Summary:${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Region: ${YELLOW}$(aws configure get region --profile $AWS_PROFILE 2>/dev/null || echo 'default')${NC}"
echo -e "Account: ${YELLOW}$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo 'unknown')${NC}"
echo -e "${BLUE}=====================================${NC}"

# Generate environment variables file
ENV_FILE="$CDK_DIR/.env.$ENVIRONMENT"
echo -e "${BLUE}Generating environment variables file: $ENV_FILE${NC}"

cat > "$ENV_FILE" << EOF
# Auto-generated environment variables for $ENVIRONMENT
# Generated on: $(date)

# AWS Configuration
AWS_REGION=$(aws configure get region --profile $AWS_PROFILE 2>/dev/null || echo 'us-east-1')

# S3 Configuration (get from stack outputs)
# You need to set these values from the CloudFormation outputs above:
# S3_BUCKET_NAME=<bucket-name-from-output>
# S3_CDN_DOMAIN=<cdn-domain-from-output>

# Example:
# S3_BUCKET_NAME=namecard-images-$ENVIRONMENT-123456789012
# S3_CDN_DOMAIN=d123456789abcdef.cloudfront.net

EOF

echo -e "${GREEN}✓ Environment file created: $ENV_FILE${NC}"
echo -e "${YELLOW}Please update the environment file with actual values from the stack outputs above${NC}"

echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${BLUE}=====================================${NC}"