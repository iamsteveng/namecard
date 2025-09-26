#!/bin/bash

# Extract environment variables from CDK stack outputs
# Usage: ./scripts/get-env-vars.sh [environment] [aws-profile]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-development}
AWS_PROFILE=${2:-default}

# Set AWS profile if provided
if [ "$AWS_PROFILE" != "default" ]; then
  export AWS_PROFILE="$AWS_PROFILE"
fi

STACK_NAME="NameCardInfra-$ENVIRONMENT"

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  NameCard Environment Variables${NC}"
echo -e "${BLUE}=====================================${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Stack: ${YELLOW}$STACK_NAME${NC}"
echo -e "${BLUE}=====================================${NC}"

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; then
  echo -e "${RED}✗ Stack $STACK_NAME not found${NC}"
  echo "Please deploy the stack first:"
  echo "  ./scripts/deploy.sh $ENVIRONMENT"
  exit 1
fi

# Get stack outputs
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null)

if [ "$OUTPUTS" = "null" ] || [ -z "$OUTPUTS" ]; then
  echo -e "${RED}✗ No outputs found for stack $STACK_NAME${NC}"
  exit 1
fi

# Extract specific values using jq
get_output_value() {
  local key=$1
  echo "$OUTPUTS" | jq -r ".[] | select(.OutputKey==\"$key\") | .OutputValue" 2>/dev/null || echo ""
}

# Get AWS region
AWS_REGION=$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || echo "us-east-1")

# Extract environment variables
S3_BUCKET_NAME=$(get_output_value "S3BucketNameEnvVar")
S3_REGION=$(get_output_value "S3RegionEnvVar")
S3_CDN_DOMAIN=$(get_output_value "S3CdnDomainEnvVar")
CLOUDFRONT_DISTRIBUTION_ID=$(get_output_value "CloudFrontDistributionId")
BUCKET_ARN=$(get_output_value "BucketArn")

echo -e "${GREEN}Environment Variables for $ENVIRONMENT:${NC}"
echo -e "${BLUE}=====================================${NC}"

# Generate .env format
cat << EOF

# AWS S3 Configuration for $ENVIRONMENT
# Generated on: $(date)
# Stack: $STACK_NAME

# AWS General Configuration
AWS_REGION=$AWS_REGION

# S3 Bucket Configuration
S3_BUCKET_NAME=$S3_BUCKET_NAME
S3_REGION=$S3_REGION

EOF

# Add CDN domain if available
if [ -n "$S3_CDN_DOMAIN" ] && [ "$S3_CDN_DOMAIN" != "" ]; then
cat << EOF
# CloudFront CDN Configuration
S3_CDN_DOMAIN=$S3_CDN_DOMAIN

EOF
fi

# Add additional configuration
cat << EOF
# Optional S3 Configuration
S3_URL_EXPIRATION=3600
MAX_FILE_SIZE=10485760

# AWS Credentials (set these manually for local development)
# AWS_ACCESS_KEY_ID=your-access-key-here
# AWS_SECRET_ACCESS_KEY=your-secret-key-here

EOF

echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN}Additional Information:${NC}"
echo -e "${BLUE}=====================================${NC}"

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ] && [ "$CLOUDFRONT_DISTRIBUTION_ID" != "" ]; then
  echo -e "CloudFront Distribution ID: ${YELLOW}$CLOUDFRONT_DISTRIBUTION_ID${NC}"
fi

if [ -n "$BUCKET_ARN" ] && [ "$BUCKET_ARN" != "" ]; then
  echo -e "S3 Bucket ARN: ${YELLOW}$BUCKET_ARN${NC}"
fi

if [ -n "$S3_CDN_DOMAIN" ] && [ "$S3_CDN_DOMAIN" != "" ]; then
  echo -e "CDN URL: ${YELLOW}https://$S3_CDN_DOMAIN${NC}"
fi

echo -e "${BLUE}=====================================${NC}"

# Save to file option
read -p "Save to .env.$ENVIRONMENT file? (y/n): " save_file
if [ "$save_file" = "y" ] || [ "$save_file" = "Y" ]; then
  ENV_FILE="../services/api/.env.$ENVIRONMENT"
  
  cat > "$ENV_FILE" << EOF
# AWS S3 Configuration for $ENVIRONMENT
# Generated on: $(date)
# Stack: $STACK_NAME

# Server Configuration
NODE_ENV=$ENVIRONMENT
PORT=3001
API_VERSION=v1

# Database (update with your database URL)
DATABASE_URL="postgresql://namecard:password@localhost:5432/namecard_${ENVIRONMENT}"

# Authentication (update with your JWT secret)
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# AWS General Configuration
AWS_REGION=$AWS_REGION

# S3 Bucket Configuration
S3_BUCKET_NAME=$S3_BUCKET_NAME
S3_REGION=$S3_REGION
EOF

  # Add CDN domain if available
  if [ -n "$S3_CDN_DOMAIN" ] && [ "$S3_CDN_DOMAIN" != "" ]; then
    echo "S3_CDN_DOMAIN=$S3_CDN_DOMAIN" >> "$ENV_FILE"
  fi

  cat >> "$ENV_FILE" << EOF

# Optional S3 Configuration
S3_URL_EXPIRATION=3600
MAX_FILE_SIZE=10485760

# AWS Credentials (set these manually for local development)
# AWS_ACCESS_KEY_ID=your-access-key-here
# AWS_SECRET_ACCESS_KEY=your-secret-key-here

# AWS Cognito (update with your Cognito configuration)
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_REGION=$AWS_REGION

# AWS Textract
TEXTRACT_REGION=$AWS_REGION

# Redis (update with your Redis configuration)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
EOF

  echo -e "${GREEN}✓ Environment file saved: $ENV_FILE${NC}"
  echo -e "${YELLOW}⚠️  Please update AWS credentials and other configuration values as needed${NC}"
fi

echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN}🎉 Environment variables extracted successfully!${NC}"
echo -e "${BLUE}=====================================${NC}"
