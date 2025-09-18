import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { logger, textractService } from '@namecard/serverless-shared';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  
  logger.logRequest(event.httpMethod, event.path, {
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  try {
    // Extract user from JWT (should be set by auth middleware in proxy)
    const user = JSON.parse(event.headers['x-user-data'] || '{}');
    if (!user.id) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'User authentication required',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info('Checking OCR service health', {
      userId: user.id,
    });

    const healthCheck = await textractService.healthCheck();

    const response = {
      success: healthCheck.status === 'healthy',
      data: healthCheck,
      timestamp: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    
    logger.logResponse(statusCode, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    logger.error(
      'OCR health check failed',
      error instanceof Error ? error : undefined,
      { requestId: context.awsRequestId }
    );

    const duration = Date.now() - startTime;
    logger.logResponse(503, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'OCR service health check failed',
        details: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
