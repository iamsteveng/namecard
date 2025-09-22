import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  logger,
  ImageValidationService,
  AppError,
  createErrorResponse,
  getRequestId,
  verifyAuthToken,
  parseMultipartFormData,
  findFile,
} from '@namecard/serverless-shared';
import {
  processImageBuffer,
  buildUploadResponse,
  buildOcrQueuePayload,
  enqueueOcrJob,
} from './lib/shared';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/upload/single', {
    requestId,
    functionName: context.functionName,
  });

  try {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    const user = await verifyAuthToken(authHeader);

    if (!user) {
      return createErrorResponse('User not authenticated', 401, requestId);
    }

    let formData;
    try {
      formData = parseMultipartFormData(event);
    } catch (parseError) {
      logger.warn('Failed to parse multipart form data', {
        requestId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Invalid multipart form data',
        }),
      };
    }
    const filePart = findFile(formData, 'image') || formData.files[0];

    if (!filePart) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'No image file provided',
        }),
      };
    }

    const fileBuffer = filePart.content;
    const fileName = filePart.filename || 'upload.jpg';
    const mimeType = filePart.contentType || 'application/octet-stream';

    logger.info('Image upload received', {
      userId: user.id,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
    });

    const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
    const validationResult = await ImageValidationService.validateImage(
      fileBuffer,
      fileName,
      validationConfig
    );

    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: `Image validation failed: ${validationResult.errors.join(', ')}`,
          details: validationResult.errors,
        }),
      };
    }

    const processed = await processImageBuffer({
      buffer: fileBuffer,
      fileName,
      mimeType,
      userId: user.id,
      validationResult,
    });

    const responsePayload = {
      success: true,
      message: 'Image uploaded, validated, and processed successfully',
      data: buildUploadResponse(processed),
    };

    if (validationResult.warnings.length > 0) {
      logger.warn('Image validation warnings', {
        userId: user.id,
        fileName,
        warnings: validationResult.warnings,
      });
    }

    await enqueueOcrJob(buildOcrQueuePayload(processed, requestId));

    logger.info('Image upload completed', {
      userId: user.id,
      imageId: processed.imageId,
      fileName,
      storageKey: processed.storageUpload.key,
      originalKey: processed.originalUpload.key,
      variants: Object.keys(processed.variantUploads),
    });

    const duration = Date.now() - startTime;
    logger.logResponse(201, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responsePayload),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Image upload failed', error instanceof Error ? error : undefined, {
      requestId: context.awsRequestId,
    });

    logger.logResponse(500, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: error.message,
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'Image upload failed',
      }),
    };
  }
};
