import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { logger, env } from '@namecard/serverless-shared';

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

    const allowedTypes = env.upload?.allowedTypes || [
      'image/jpeg', 'image/png', 'image/heic', 'image/webp'
    ];
    const maxFileSize = env.upload?.maxFileSize || 10 * 1024 * 1024; // 10MB

    const response = {
      success: true,
      data: {
        service: 'AWS Textract OCR',
        version: '1.0.0',
        capabilities: {
          textDetection: true,
          documentAnalysis: true,
          businessCardParsing: true,
          imagePreprocessing: true,
        },
        limits: {
          maxFileSize,
          allowedTypes,
          maxImageDimension: 3000,
        },
        endpoints: {
          textExtraction: '/api/v1/scan/text',
          documentAnalysis: '/api/v1/scan/analyze',
          businessCardScanning: '/api/v1/scan/business-card',
          healthCheck: '/api/v1/scan/health',
        },
      },
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
  } catch (error: any) {
    logger.error(
      'OCR info failed',
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
        error: 'Failed to get OCR service information',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
