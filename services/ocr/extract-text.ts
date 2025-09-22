import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  textractService,
  parseMultipartFormData,
  findFile,
} from '@namecard/serverless-shared';

const parseUser = (event: APIGatewayProxyEvent) => {
  try {
    const raw = event.headers['x-user-data'] || event.headers['X-User-Data'];
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    logger.error('Failed to parse x-user-data header', error instanceof Error ? error : undefined);
    return {};
  }
};

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
    const user = parseUser(event);
    if (!user?.id) {
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
    let mimeType = 'image/png';

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
        mimeType = filePart.contentType || mimeType;
      } catch (parseError) {
        logger.warn('OCR extract-text multipart parse failed', {
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
        mimeType = body.mimeType || mimeType;
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

    const ocrResult = await textractService.detectText(fileBuffer, mimeType);

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
        data: { ocrResult },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    logger.error('OCR text extraction failed', error instanceof Error ? error : undefined, {
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
        error: error?.message || 'OCR processing failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
