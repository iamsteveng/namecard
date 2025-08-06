# Deployment Guide

This guide explains how to deploy the Namecard application to AWS using the provided deployment scripts.

## Prerequisites

1. AWS CLI installed and configured with appropriate credentials
2. Docker installed (for API deployment)
3. Node.js and npm installed
4. Serverless Framework installed globally (`npm install -g serverless`)
5. AWS CDK installed globally (`npm install -g aws-cdk`)

## Deployment Scripts

The project includes several deployment scripts to automate the deployment process:

### 1. API Deployment (`packages/api/scripts`)

- `deploy-ecr.sh`: Builds and pushes the API Docker image to Amazon ECR
- `deploy-ecs.sh`: Updates the ECS service with the new Docker image
- `deploy.sh`: Combines both ECR and ECS deployment steps
- `update-task-definition.sh`: Updates the task definition with the current AWS account ID
- `create-ecs-service.sh`: Creates the ECS service if it doesn't exist

### 2. Frontend Deployment (`packages/web/scripts`)

- `deploy-frontend.sh`: Builds and deploys the frontend to S3 and invalidates CloudFront

### 3. Lambda Workers Deployment (`packages/workers/scripts`)

- `deploy-workers.sh`: Deploys the Lambda workers using the Serverless Framework

### 4. Comprehensive Deployment (`scripts/deploy-all.sh`)

This script orchestrates the deployment of all components in the correct order:

1. Deploys infrastructure using AWS CDK
2. Builds and deploys the API to ECS
3. Builds and deploys the frontend to S3/CloudFront
4. Deploys Lambda workers

### 5. Component Deployment (`scripts/deploy-component.sh`)

This script allows deploying individual components for troubleshooting or incremental deployments:

1. `api`: Deploys the API to ECS
2. `frontend`: Deploys the frontend to S3/CloudFront
3. `workers`: Deploys Lambda workers
4. `infra`: Deploys infrastructure using AWS CDK

## Usage

### Deploy All Components

```bash
# From the project root directory
./scripts/deploy-all.sh \
  --stage dev \
  --region us-east-1 \
  --bucket your-s3-bucket-name \
  --distribution-id your-cloudfront-distribution-id
```

### Deploy Individual Components

#### Using Component Deployment Script

```bash
# Deploy infrastructure only
./scripts/deploy-component.sh --component infra --stage dev --region us-east-1

# Deploy API only
./scripts/deploy-component.sh --component api --stage dev --region us-east-1

# Deploy frontend only
./scripts/deploy-component.sh \
  --component frontend \
  --stage dev \
  --region us-east-1 \
  --bucket your-s3-bucket-name \
  --distribution-id your-cloudfront-distribution-id

# Deploy workers only
./scripts/deploy-component.sh --component workers --stage dev --region us-east-1
```

#### Using Package-specific Scripts

##### API

```bash
cd packages/api

# Update task definition with current account ID
npm run update-task-definition

# Deploy to ECR and ECS
npm run deploy

# Create ECS service (if needed)
npm run create-ecs-service -- --stage dev --region us-east-1
```

##### Frontend

```bash
cd packages/web

# Deploy to S3 and invalidate CloudFront
npm run deploy -- \
  --bucket your-s3-bucket-name \
  --distribution-id your-cloudfront-distribution-id \
  --region us-east-1
```

##### Lambda Workers

```bash
cd packages/workers

# Deploy workers
npm run deploy-workers -- --stage dev --region us-east-1
```

## Environment-specific Deployments

For staging and production deployments, use the appropriate stage parameter:

```bash
# Staging
./scripts/deploy-all.sh --stage staging [other options]

# Production
./scripts/deploy-all.sh --stage prod [other options]
```

## Troubleshooting

1. Ensure AWS credentials are properly configured
2. Verify that all required AWS resources (ECR repository, ECS cluster, etc.) exist
3. Check that the task definition ARNs and other resource identifiers are correct
4. Ensure Docker is running when deploying the API
5. Verify that the Serverless Framework is properly configured for Lambda deployments

## Security Considerations

1. Never commit AWS credentials to the repository
2. Use least privilege IAM policies for deployment
3. Regularly rotate AWS access keys
4. Use AWS Secrets Manager or Parameter Store for sensitive configuration values
