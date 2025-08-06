#!/bin/bash

# Exit on any error
set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
STAGE="dev"
REGION="us-east-1"
S3_BUCKET=""
CLOUDFRONT_DISTRIBUTION_ID=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--stage)
            STAGE="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -b|--bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -d|--distribution-id)
            CLOUDFRONT_DISTRIBUTION_ID="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -s, --stage STAGE              Deployment stage (default: dev)"
            echo "  -r, --region REGION            AWS region (default: us-east-1)"
            echo "  -b, --bucket BUCKET            S3 bucket name (required for frontend)"
            echo "  -d, --distribution-id ID       CloudFront distribution ID (required for frontend)"
            echo "  -h, --help                     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Check if required parameters are provided for frontend deployment
if [ -z "$S3_BUCKET" ] || [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo "Warning: S3 bucket name and CloudFront distribution ID are required for frontend deployment."
    echo "Frontend will be built but not deployed."
fi

# Deploy infrastructure with CDK
echo "=== Deploying Infrastructure with CDK ==="
cd "$SCRIPT_DIR/../infrastructure"
npm run cdk -- deploy --all --require-approval never

echo "=== Building and Deploying API to ECS ==="
cd "$SCRIPT_DIR/../packages/api"
# Update task definition with current account ID
npm run update-task-definition
# Deploy to ECR and ECS
npm run deploy
# Create ECS service if it doesn't exist
npm run create-ecs-service -- --stage $STAGE --region $REGION

echo "=== Building and Deploying Frontend to S3/CloudFront ==="
cd "$SCRIPT_DIR/../packages/web"
if [ -n "$S3_BUCKET" ] && [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    npm run deploy -- --bucket $S3_BUCKET --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --region $REGION
else
    echo "Skipping frontend deployment due to missing S3 bucket or CloudFront distribution ID"
    npm run build
fi

echo "=== Deploying Lambda Workers ==="
cd "$SCRIPT_DIR/../packages/workers"
npm run deploy-workers -- --stage $STAGE --region $REGION

echo "=== All deployments completed successfully! ==="
