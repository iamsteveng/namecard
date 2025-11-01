#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack.js';
import { DbStack } from '../lib/db-stack.js';
import { InfrastructureStack } from '../lib/infrastructure-stack.js';
import { SecretsStack } from '../lib/secrets-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'ap-southeast-1';

const normalizeStageName = (env: string): string => {
  switch (env) {
    case 'development':
    case 'dev':
      return 'dev';
    case 'staging':
      return 'staging';
    case 'production':
    case 'prod':
      return 'prod';
    default:
      return env;
  }
};

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

// Deploy database stack (Aurora + network primitives)
const dbStack = new DbStack(app, `NameCardDb-${environment}`, {
  env,
  description: `Aurora PostgreSQL cluster for NameCard Application - ${environment}`,
  tags: commonTags,
  environment,
});

const apiStack = new ApiStack(app, `NameCardApi-${environment}`, {
  env,
  description: `HTTP API stack for NameCard services - ${environment}`,
  tags: commonTags,
  environment,
  vpc: dbStack.vpc,
  dbCluster: dbStack.cluster,
  dbSecret: dbStack.dbSecret,
  lambdaSecurityGroup: dbStack.lambdaSecurityGroup,
  applicationSubnets: dbStack.applicationSubnetSelection,
  databaseSecurityGroup: dbStack.databaseSecurityGroup,
});

apiStack.addDependency(dbStack);

// Deploy Cognito stack
const cognitoStack = new CognitoStack(app, `NameCardCognito-${environment}`, {
  env,
  description: `AWS Cognito User Pool for NameCard Application - ${environment}`,
  tags: commonTags,
});

// Deploy secrets management stack
const secretsStack = new SecretsStack(app, `NameCardSecrets-${environment}`, {
  environment,
  env,
  description: `Secrets management for NameCard Application - ${environment}`,
  tags: commonTags,
});

// Deploy main infrastructure stack (S3 and CloudFront for images)
const infraStack = new InfrastructureStack(app, `NameCardInfra-${environment}`, {
  environment,
  env,
  description: `Main infrastructure for NameCard Application - ${environment}`,
  tags: commonTags,
});

apiStack.addDependency(infraStack);

// Deploy frontend stack (only for staging and production)
if (environment === 'staging' || environment === 'production') {
  const apiStageName = normalizeStageName(environment);
  const frontendStack = new FrontendStack(app, `NameCardFrontend-${environment}`, {
    environment,
    env,
    description: `Frontend deployment for NameCard Application - ${environment}`,
    tags: commonTags,

    // API Gateway endpoint exposed by the Lambda-based API stack
    apiUrl: apiStack.httpApi.apiEndpoint,
    apiStage: apiStageName,

    // Optional domain configuration
    domainName: domainName ? `app.${domainName}` : undefined,
    certificateArn,
  });

  frontendStack.addDependency(apiStack);
}
