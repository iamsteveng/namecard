import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { logger } from '@namecard/serverless-shared';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  logger.logRequest(event.httpMethod, event.path, {
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  const response = {
    success: true,
    service: 'OCR Service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };

  const duration = Date.now() - startTime;
  logger.logResponse(200, duration, {
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
};
