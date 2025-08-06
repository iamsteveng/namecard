#!/bin/bash

# Exit on any error
set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
COMPONENT=""
STAGE="dev"
REGION="us-east-1"
S3_BUCKET=""
CLOUDFRONT_DISTRIBUTION_ID=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--component)
            COMPONENT="$2"
            shift 2
            ;;
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
            echo "  -c, --component COMPONENT      Component to deploy (api, frontend, workers, infra)"
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

# Check if component is specified
if [ -z "$COMPONENT" ]; then
    echo "Error: Component must be specified."
    echo "Use -h or --help for usage information."
    exit 1
fi

# Deploy based on component
case $COMPONENT in
    api)
        echo "=== Building and Deploying API to ECS ==="
        cd "$SCRIPT_DIR/../packages/api"
        # Update task definition with current account ID
        npm run update-task-definition
        # Deploy to ECR and ECS
        npm run deploy
        # Create ECS service if it doesn't exist
        npm run create-ecs-service -- --stage $STAGE --region $REGION
        ;;
    frontend)
        echo "=== Building and Deploying Frontend to S3/CloudFront ==="
        cd "$SCRIPT_DIR/../packages/web"
        if [ -n "$S3_BUCKET" ] && [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
            npm run deploy -- --bucket $S3_BUCKET --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --region $REGION
        else
            echo "Error: S3 bucket name and CloudFront distribution ID are required for frontend deployment."
            exit 1
        fi
        ;;
    workers)
        echo "=== Deploying Lambda Workers ==="
        cd "$SCRIPT_DIR/../packages/workers"
        npm run deploy-workers -- --stage $STAGE --region $REGION
        ;;
    infra)
        echo "=== Deploying Infrastructure with CDK ==="
        cd "$SCRIPT_DIR/../infrastructure"
        npm run cdk -- deploy --all --require-approval never
        ;;
    *)
        echo "Error: Unknown component '$COMPONENT'. Valid components are: api, frontend, workers, infra."
        exit 1
        ;;
esac

echo "=== Deployment of $COMPONENT completed successfully! ==="
