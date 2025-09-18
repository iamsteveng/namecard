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

  try {
    // Extract user from JWT (should be set by auth middleware in proxy)
    const user = JSON.parse(event.headers['x-user-data'] || '{}');
    if (!user.id) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Authentication required',
        }),
      };
    }

    const availableSources = ['perplexity'];
    const sourceConfigs = [
      {
        source: 'perplexity',
        enabled: true,
        hasApiKey: true,
      },
      {
        source: 'clearbit', 
        enabled: false,
        hasApiKey: false,
      },
      {
        source: 'linkedin',
        enabled: false,
        hasApiKey: false,
      },
    ];

    const response = {
      success: true,
      sources: availableSources,
      total: availableSources.length,
      configuration: sourceConfigs,
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
  } catch (error: any) {
    logger.error(
      'Error getting enrichment sources',
      error instanceof Error ? error : undefined,
      { requestId: context.awsRequestId }
    );

    const duration = Date.now() - startTime;
    logger.logResponse(500, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'Failed to get enrichment sources',
        error: error.message,
      }),
    };
  }
};
