# Troubleshooting Guide

This guide provides solutions for common issues encountered when deploying the Namecard application.

## CDK Deployment Issues

### 1. Stack Creation Failures

**Problem**: CDK stack deployment fails with `ROLLBACK_COMPLETE` status.

**Solution**:
1. Check AWS CloudFormation console for detailed error messages
2. Delete failed stacks manually from AWS console
3. Ensure all required AWS resources exist before deployment
4. Verify AWS credentials and permissions

### 2. Missing Dependencies

**Problem**: TypeScript compilation errors when running CDK commands.

**Solution**:
1. Install infrastructure dependencies:
   ```bash
   cd infrastructure
   npm install
   ```
2. Install missing type definitions:
   ```bash
   npm install --save-dev @types/node
   ```

### 3. Multiple Stack Deployment

**Problem**: CDK command fails when multiple stacks are present.

**Solution**:
1. Deploy all stacks:
   ```bash
   npm run cdk -- deploy --all
   ```
2. Deploy specific stacks:
   ```bash
   npm run cdk -- deploy NameCardCognito-development NameCardInfra-development
   ```

## AWS Authentication Issues

### 1. Invalid Credentials

**Problem**: AWS CLI commands fail with authentication errors.

**Solution**:
1. Configure AWS credentials:
   ```bash
   aws configure
   ```
2. Verify credentials:
   ```bash
   aws sts get-caller-identity
   ```

### 2. Insufficient Permissions

**Problem**: Deployment fails due to missing IAM permissions.

**Solution**:
1. Ensure IAM user has required policies:
   - AdministratorAccess or
   - Custom policy with necessary permissions for:
     - CloudFormation
     - S3
     - CloudFront
     - ECS
     - ECR
     - Lambda
     - Cognito
     - RDS
     - Textract
2. Check specific error messages in CloudFormation events

## Docker Issues

### 1. Docker Build Failures

**Problem**: API Docker image build fails.

**Solution**:
1. Ensure Docker is running
2. Check Dockerfile syntax
3. Verify all dependencies are correctly specified

### 2. ECR Push Failures

**Problem**: Unable to push Docker image to ECR.

**Solution**:
1. Authenticate with ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
   ```
2. Verify ECR repository exists
3. Check IAM permissions for ECR

## Serverless Framework Issues

### 1. Lambda Deployment Failures

**Problem**: Serverless deployment fails.

**Solution**:
1. Install Serverless Framework:
   ```bash
   npm install -g serverless
   ```
2. Configure Serverless with AWS credentials:
   ```bash
   serverless config credentials --provider aws --key YOUR_ACCESS_KEY --secret YOUR_SECRET_KEY
   ```

## Frontend Deployment Issues

### 1. S3 Deployment Failures

**Problem**: Unable to deploy frontend to S3.

**Solution**:
1. Verify S3 bucket exists and is correctly configured
2. Check IAM permissions for S3
3. Ensure CloudFront distribution ID is correct

## General Troubleshooting Tips

1. **Check logs**: Always check CloudFormation events, Docker build logs, and application logs for detailed error messages
2. **Verify prerequisites**: Ensure all required tools (AWS CLI, Docker, Node.js, etc.) are installed and properly configured
3. **Test incrementally**: Deploy components one at a time to isolate issues
4. **Clean up resources**: Remove failed stacks and resources before retrying deployment
5. **Check versions**: Ensure compatible versions of tools and dependencies are used

## Common Error Messages and Solutions

| Error | Solution |
|-------|----------|
| `The stack named XYZ failed creation` | Check CloudFormation console for detailed error, delete stack manually, fix underlying issue |
| `Cannot find module 'aws-cdk-lib'` | Run `npm install` in infrastructure directory |
| `No such file or directory` during Docker build | Verify all files are in correct locations and Dockerfile paths are correct |
| `AccessDenied` during AWS operations | Check AWS credentials and IAM permissions |
| `RepositoryNotFoundException` during ECR push | Create ECR repository before pushing image |
