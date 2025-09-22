import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  ImagePreprocessingService,
  parseMultipartFormData,
  findFile,
} from '@namecard/serverless-shared';

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
    if (!event.body) {
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

    let fileBuffer: Buffer | undefined;

    if (event.headers['content-type']?.includes('multipart/form-data')) {
      try {
        const formData = parseMultipartFormData(event);
        const filePart = findFile(formData, 'image') || formData.files[0];
        if (!filePart) {
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
        fileBuffer = filePart.content;
      } catch (parseError) {
        logger.warn('OCR preprocess multipart parse failed', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Invalid multipart form data',
            timestamp: new Date().toISOString(),
          }),
        };
      }
    } else {
      try {
        const body = JSON.parse(event.body);
        fileBuffer = Buffer.from(body.file, 'base64');
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
    }

    if (!fileBuffer) {
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

    const options = ImagePreprocessingService.getOptionsForUseCase('ocr');
    const processed = await ImagePreprocessingService.processImage(fileBuffer, options);

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          metadata: processed.metadata,
          optimizations: processed.optimizations,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    logger.error('OCR preprocess failed', error instanceof Error ? error : undefined, {
      requestId: context.awsRequestId,
    });

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
        error: error?.message || 'Image preprocessing failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
