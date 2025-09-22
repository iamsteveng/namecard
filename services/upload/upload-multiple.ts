import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  ImageValidationService,
  AppError,
  createErrorResponse,
  getRequestId,
  verifyAuthToken,
  parseMultipartFormData,
} from '@namecard/serverless-shared';

import {
  processImageBuffer,
  buildUploadResponse,
  buildOcrQueuePayload,
  enqueueOcrJob,
} from './lib/shared';
import type { MultipartFile } from '@namecard/serverless-shared';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest(event.httpMethod, event.path, {
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

    const files = formData.files.filter((file: MultipartFile) =>
      ['images', 'image'].includes(file.fieldName)
    );

    if (files.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'No image files provided',
        }),
      };
    }

    const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
    const validationResults = await Promise.all(
      files.map(file =>
        ImageValidationService.validateImage(file.content, file.filename, validationConfig)
      )
    );

    const invalidFiles = validationResults
      .map((result, index) => ({ result, index }))
      .filter(item => !item.result.isValid)
      .map(item => ({
        name: files[item.index]!.filename,
        errors: item.result.errors,
      }));

    if (invalidFiles.length > 0) {
      const message = invalidFiles
        .map(entry => `${entry.name}: ${entry.errors.join(', ')}`)
        .join('; ');

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: `Batch validation failed for ${invalidFiles.length} file(s): ${message}`,
          details: invalidFiles,
        }),
      };
    }

    const processedImages = [];

    for (const [index, file] of files.entries()) {
      const validationResult = validationResults[index]!;
      const processed = await processImageBuffer({
        buffer: file.content,
        fileName: file.filename,
        mimeType: file.contentType,
        userId: user.id,
        validationResult,
      });

      processedImages.push(processed);
    }

    const responseItems = processedImages.map(processed => buildUploadResponse(processed));

    const totalSize = processedImages.reduce((sum, item) => sum + item.fileSize, 0);
    const totalWarnings = processedImages.reduce(
      (sum, item) => sum + (item.validation.warnings?.length || 0),
      0
    );

    for (const processed of processedImages) {
      await enqueueOcrJob(buildOcrQueuePayload(processed, requestId));
    }

    logger.info('Batch image upload completed', {
      userId: user.id,
      fileCount: processedImages.length,
      totalSize,
      warnings: totalWarnings,
    });

    const responsePayload = {
      success: true,
      message: `${processedImages.length} images uploaded, validated, and processed successfully`,
      data: {
        files: responseItems,
        totalFiles: files.length,
        processedFiles: processedImages.length,
        totalSize,
        uploadedBy: user.id,
        validation: {
          overallValid: true,
          warnings: totalWarnings,
        },
      },
    };

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

    logger.error('Multiple images upload failed', error instanceof Error ? error : undefined, {
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
        message: 'Multiple images upload failed',
      }),
    };
  }
};
