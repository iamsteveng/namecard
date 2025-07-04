// Jest setup for workers package
require('@testing-library/jest-dom');

// Mock AWS SDK
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-textract');
jest.mock('@aws-sdk/client-sqs');

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';