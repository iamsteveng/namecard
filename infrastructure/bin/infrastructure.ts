#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack';
import { InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

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
new CognitoStack(app, `NameCardCognito-${environment}`, {
  env,
  description: `AWS Cognito User Pool for NameCard Application - ${environment}`,
  tags: commonTags,
});

// Deploy main infrastructure stack (includes S3)
new InfrastructureStack(app, `NameCardInfra-${environment}`, {
  environment,
  env,
  description: `Main infrastructure for NameCard Application - ${environment}`,
  tags: commonTags,
});