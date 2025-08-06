# CI/CD Pipeline Setup Guide

This document explains how to set up the CI/CD pipeline for the NameCard application.

## Prerequisites

1. AWS account with appropriate permissions
2. GitHub repository for the project
3. AWS CLI configured locally

## GitHub Secrets Setup

You need to configure the following secrets in your GitHub repository:

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Add the following secrets:

### AWS Credentials
- `AWS_ACCESS_KEY_ID`: Your AWS access key ID
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key

### Deployment Configuration
- `S3_BUCKET_NAME`: The name of your S3 bucket for frontend deployment
- `CLOUDFRONT_DISTRIBUTION_ID`: The CloudFront distribution ID for invalidation

## Environment Setup

The CI/CD pipeline supports three environments:

1. **Development** (develop branch)
2. **Staging** (staging branch)
3. **Production** (main branch)

Each environment should have its own set of AWS resources and GitHub environments configured.

## AWS Permissions

The AWS credentials need the following permissions:

### For CDK Infrastructure Deployment
- Full access to CloudFormation
- Full access to S3
- Full access to CloudFront
- Full access to Cognito
- Full access to IAM (for creating roles and policies)

### For Frontend Deployment
- S3 bucket write access
- CloudFront invalidation permissions

### For API Deployment
- ECS deployment permissions
- ECR push permissions
- EC2 permissions (for ECS networking)

### For Worker Deployment
- Lambda deployment permissions
- SQS permissions (if using queues)

## Pipeline Overview

### CI Pipeline (`ci.yml`)
- Runs on push and pull requests to main, develop branches
- Performs linting, type checking, and testing
- Builds all packages

### CD Pipeline (`cd.yml`)
- Runs on push to main, develop, and staging branches
- Deploys infrastructure using AWS CDK
- Deploys frontend to S3/CloudFront
- Deploys API to ECS
- Deploys workers to Lambda

### Environment-Specific Pipelines
- `deploy-dev.yml`: Deployment to development environment
- `deploy-staging.yml`: Deployment to staging environment
- `deploy-prod.yml`: Deployment to production environment

## Manual Deployment

You can also trigger the production deployment manually:

1. Go to the Actions tab in your GitHub repository
2. Select the "Deploy to Production" workflow
3. Click "Run workflow"
4. Confirm the deployment

## Troubleshooting

### Common Issues

1. **AWS Permissions**: Ensure your AWS credentials have the necessary permissions
2. **CDK Bootstrap**: You may need to bootstrap CDK in your AWS account:
   ```bash
   cd infrastructure
   npx cdk bootstrap
   ```
3. **Environment Variables**: Make sure all required environment variables are set

### Logs and Monitoring

You can view the pipeline logs in the GitHub Actions tab of your repository.

## Security Considerations

1. Never commit AWS credentials to the repository
2. Use GitHub environments for production deployments
3. Regularly rotate AWS access keys
4. Use least privilege principle for AWS permissions

## Next Steps

1. Configure GitHub secrets as described above
2. Bootstrap CDK in your AWS account if not already done
3. Test the pipeline by pushing to the develop branch
4. Monitor the deployment and verify all components are working correctly
