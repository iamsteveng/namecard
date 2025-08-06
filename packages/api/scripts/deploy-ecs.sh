#!/bin/bash

# Exit on any error
set -e

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Default values
REGION="us-east-1"
CLUSTER_NAME="namecard-cluster"
SERVICE_NAME="namecard-api-service"
TASK_DEFINITION_NAME="namecard-api-task"
CONTAINER_NAME="namecard-api"
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
        -c|--cluster)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        -s|--service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -r, --region REGION        AWS region (default: us-east-1)"
            echo "  -t, --tag TAG             Image tag (default: latest)"
            echo "  -c, --cluster CLUSTER     ECS cluster name (default: namecard-cluster)"
            echo "  -s, --service SERVICE     ECS service name (default: namecard-api-service)"
            echo "  -h, --help                Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Construct the full image URI
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/namecard-api:$IMAGE_TAG"

echo "Deploying image $IMAGE_URI to ECS service $SERVICE_NAME in cluster $CLUSTER_NAME"

# Update the ECS service with the new task definition
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --force-new-deployment \
    --region $REGION

echo "ECS service update initiated. Deployment may take a few minutes to complete."

echo "You can monitor the deployment status with:"
echo "aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $REGION"
