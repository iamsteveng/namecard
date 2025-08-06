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
TASK_DEFINITION="namecard-api"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            REGION="$2"
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
        -t|--task-definition)
            TASK_DEFINITION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -r, --region REGION            AWS region (default: us-east-1)"
            echo "  -c, --cluster CLUSTER          ECS cluster name (default: namecard-cluster)"
            echo "  -s, --service SERVICE          ECS service name (default: namecard-api-service)"
            echo "  -t, --task-definition TASK     Task definition name (default: namecard-api)"
            echo "  -h, --help                     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Check if the service already exists
if aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $REGION &> /dev/null; then
    echo "ECS service $SERVICE_NAME already exists in cluster $CLUSTER_NAME"
    exit 0
fi

# Create the ECS service
echo "Creating ECS service $SERVICE_NAME in cluster $CLUSTER_NAME"

aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --task-definition $TASK_DEFINITION \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-12345678,subnet-87654321],securityGroups=[sg-12345678],assignPublicIp=ENABLED}" \
    --region $REGION

echo "ECS service $SERVICE_NAME created successfully in cluster $CLUSTER_NAME"
