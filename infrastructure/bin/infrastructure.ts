#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { ProductionStack } from '../lib/production-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'ap-southeast-1';

// Optional domain configuration for production
const domainName = app.node.tryGetContext('domainName'); // e.g., 'namecard.app'
const certificateArn = app.node.tryGetContext('certificateArn');

// Common environment configuration
const env = {
  account,
  region,
};

// Common tags
const commonTags = {
  Project: 'NameCard',
  Environment: environment,
  ManagedBy: 'CDK',
};

// Deploy Cognito stack
const cognitoStack = new CognitoStack(app, `NameCardCognito-${environment}`, {
  env,
  description: `AWS Cognito User Pool for NameCard Application - ${environment}`,
  tags: commonTags,
});

// Deploy main infrastructure stack (S3 and CloudFront for images)
const infraStack = new InfrastructureStack(app, `NameCardInfra-${environment}`, {
  environment,
  env,
  description: `Main infrastructure for NameCard Application - ${environment}`,
  tags: commonTags,
});

// Deploy production stack (VPC, RDS, ECS, ALB) - only for staging and production
if (environment === 'staging' || environment === 'production') {
  const productionStack = new ProductionStack(app, `NameCardProd-${environment}`, {
    environment,
    env,
    description: `Production infrastructure for NameCard Application - ${environment}`,
    tags: commonTags,
    
    // Optional domain configuration
    domainName,
    certificateArn,
    
    // Reference existing stacks
    s3Bucket: infraStack.bucket,
    cognitoUserPoolId: cognitoStack.userPool?.userPoolId,
    cognitoClientId: undefined, // Will be retrieved from stack outputs
  });

  // Add dependencies
  productionStack.addDependency(cognitoStack);
  productionStack.addDependency(infraStack);

  // Deploy frontend stack
  const frontendStack = new FrontendStack(app, `NameCardFrontend-${environment}`, {
    environment,
    env,
    description: `Frontend deployment for NameCard Application - ${environment}`,
    tags: commonTags,
    
    // API URL from production stack
    apiUrl: `http://${productionStack.apiService.loadBalancer.loadBalancerDnsName}`,
    
    // Optional domain configuration
    domainName: domainName ? `app.${domainName}` : undefined,
    certificateArn,
  });

  // Add dependencies
  frontendStack.addDependency(productionStack);
}