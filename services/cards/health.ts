import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  lambdaHandler,
  createSuccessResponse,
  validateEnvironmentVariables,
  emitBusinessMetric,
  logger,
} from '@namecard/serverless-shared';

const requiredEnvVars = [
  'NODE_ENV',
];

async function healthHandler(
  _event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Basic validation of required environment
  validateEnvironmentVariables(requiredEnvVars);

  // Business metric for visibility
  await emitBusinessMetric('CardsHealthCheck');

  const healthData = {
    service: 'namecard-cards',
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env['NODE_ENV'],
    region: process.env['AWS_REGION'],
    runtime: `nodejs${process.version}`,
    memoryLimitInMB: context.memoryLimitInMB,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    features: {
      createCard: true,
      listCards: true,
      getCard: true,
      updateCard: true,
      deleteCard: true,
      searchCards: true,
      cardStats: true,
    },
  };

  logger.info('Cards service health', { functionName: context.functionName });

  return createSuccessResponse(healthData, 200, 'Cards service is healthy');
}

export const handler = lambdaHandler(healthHandler, {
  enableXRay: true,
  enableCustomMetrics: true,
});
