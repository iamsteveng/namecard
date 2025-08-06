#!/bin/bash

# Exit on any error
set -e

# Check if Serverless Framework is installed
if ! command -v serverless &> /dev/null; then
    echo "Serverless Framework is not installed. Please install it first."
    exit 1
fi

# Default values
STAGE="dev"
REGION="us-east-1"

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
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -s, --stage STAGE              Deployment stage (default: dev)"
            echo "  -r, --region REGION            AWS region (default: us-east-1)"
            echo "  -h, --help                     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Build the workers
npm run build

# Deploy using Serverless Framework
echo "Deploying Lambda workers to stage: $STAGE in region: $REGION"
serverless deploy --stage $STAGE --region $REGION

echo "Lambda workers deployment completed successfully!"
