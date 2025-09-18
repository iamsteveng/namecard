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

    // Parse file data from Lambda event body
    if (!event.body || !event.headers['content-type']?.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'No image file provided',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    let fileBuffer: Buffer;
    let fileName: string;
    let mimeType: string;

    try {
      // This is a simplified implementation for Lambda
      const body = JSON.parse(event.body);
      fileBuffer = Buffer.from(body.file, 'base64');
      fileName = body.fileName || 'analyze.jpg';
      mimeType = body.mimeType || 'image/jpeg';
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Invalid file data format',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info('Starting document analysis OCR', {
      userId: user.id,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
    });

    // Extract text using document analysis (more detailed)
    const ocrResult = await textractService.extractText(fileBuffer, mimeType);
    const processingTime = Date.now() - startTime;

    logger.info('Document analysis OCR completed', {
      userId: user.id,
      processingTime,
      confidence: ocrResult.confidence.toFixed(1),
      totalBlocks: ocrResult.blocks.length,
      textLength: ocrResult.rawText.length,
    });

    const response = {
      success: true,
      data: {
        ocrResult,
        processingTime,
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
    const processingTime = Date.now() - startTime;

    logger.error(
      'Document analysis OCR failed',
      error instanceof Error ? error : undefined,
      { processingTime, requestId: context.awsRequestId }
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
        error: error.message || 'Document analysis failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
