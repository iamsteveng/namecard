#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack';

const app = new cdk.App();

new CognitoStack(app, 'NameCardCognitoStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'AWS Cognito User Pool for NameCard Application',
  tags: {
    Project: 'NameCard',
    Environment: 'Development',
    ManagedBy: 'CDK',
  },
});