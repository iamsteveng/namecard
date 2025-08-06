#!/bin/bash

# Exit on any error
set -e

# Default values
REGION="us-east-1"
IMAGE_TAG="latest"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -r, --region REGION    AWS region (default: us-east-1)"
            echo "  -t, --tag TAG         Image tag (default: latest)"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Deploy to ECR
./scripts/deploy-ecr.sh -r $REGION -t $IMAGE_TAG

# Deploy to ECS
./scripts/deploy-ecs.sh -r $REGION -t $IMAGE_TAG

echo "Deployment completed successfully!"
