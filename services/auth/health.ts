/**
 * Auth Service Health Check Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  lambdaHandler,
  createSuccessResponse,
  validateEnvironmentVariables,
  emitBusinessMetric,
} from '@namecard/serverless-shared';

const requiredEnvVars = [
  'NODE_ENV',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID'
];

async function healthCheckHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Validate required environment variables
    validateEnvironmentVariables(requiredEnvVars);

    // Emit health check metric
    await emitBusinessMetric('AuthHealthCheck');

    const healthData = {
      service: 'namecard-auth',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      region: process.env.AWS_REGION,
      runtime: `nodejs${process.version}`,
      memoryLimitInMB: context.memoryLimitInMB,
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
      features: {
        registration: true,
        login: true,
        tokenRefresh: true,
        profile: true,
        logout: true,
      },
      dependencies: {
        database: 'available', // Will be verified when DB connection is added
        cognito: 'available',
        secrets: 'available',
      },
    };

    return createSuccessResponse(healthData, 'Auth service is healthy');
  } catch (error) {
    console.error('Auth service health check failed:', error);
    throw error;
  }
}

// Export the handler with Lambda wrapper for monitoring and error handling
export const handler = lambdaHandler(healthCheckHandler, {
  enableXRay: true,
  enableCustomMetrics: true,
});