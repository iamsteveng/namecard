import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  ImageValidationService,
  ImagePreprocessingService,
  AppError,
  createErrorResponse,
  getRequestId,
  verifyAuthTokenSimple,
} from '@namecard/serverless-shared';

// Note: MIME type and size validation handled by ImageValidationService

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
    // Verify authentication
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    const user = await verifyAuthTokenSimple(authHeader);
    
    if (!user) {
      return createErrorResponse('User not authenticated', 401, requestId);
    }

    // Parse multipart form data from Lambda event
    if (!event.body || !event.headers['content-type']?.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'No image file provided',
        }),
      };
    }

    // For Lambda, we need to handle multipart parsing differently
    // In a real implementation, you'd use a library like busboy or lambda-multipart-parser
    // For this example, let's assume the file buffer is passed in the body
    let fileBuffer: Buffer;
    let fileName: string;
    let mimeType: string;

    try {
      // This is a simplified implementation
      // In practice, you'd need proper multipart parsing
      const body = JSON.parse(event.body);
      fileBuffer = Buffer.from(body.file, 'base64');
      fileName = body.fileName || 'upload.jpg';
      mimeType = body.mimeType || 'image/jpeg';
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Invalid file data format',
        }),
      };
    }

    logger.info('Image upload received', {
      userId: user.id,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
    });

    // Comprehensive image validation
    const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
    const validationResult = await ImageValidationService.validateImage(
      fileBuffer,
      fileName,
      validationConfig
    );

    // Return validation errors if image is invalid
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: `Image validation failed: ${validationResult.errors.join(', ')}`,
        }),
      };
    }

    // Apply image preprocessing for business card optimization
    const preprocessingOptions = ImagePreprocessingService.getOptionsForUseCase('storage');
    const preprocessingResult = await ImagePreprocessingService.processImage(
      fileBuffer,
      preprocessingOptions
    );

    // Create variants for different use cases
    const variants = await ImagePreprocessingService.createVariants(fileBuffer, [
      { name: 'original', options: { purpose: 'storage' } },
      { name: 'ocr', options: { purpose: 'ocr' } },
      { name: 'thumbnail', options: { purpose: 'thumbnail' } },
      { name: 'web', options: { purpose: 'web-display' } },
    ]);

    // Build response with validation and preprocessing metadata
    const response = {
      success: true,
      message: 'Image uploaded, validated, and processed successfully',
      data: {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalName: fileName,
        size: fileBuffer.length,
        mimeType,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
        status: 'processed',
        validation: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings,
          metadata: validationResult.metadata,
        },
        processing: {
          primaryResult: {
            size: preprocessingResult.metadata.processedSize,
            format: preprocessingResult.metadata.outputFormat,
            dimensions: preprocessingResult.metadata.processedDimensions,
            compressionRatio: preprocessingResult.metadata.compressionRatio,
            processingTime: preprocessingResult.metadata.processingTime,
            optimizations: preprocessingResult.optimizations,
            warnings: preprocessingResult.warnings,
          },
          variants: Object.keys(variants).reduce((acc, key) => {
            const v = variants[key];
            if (!v) return acc;
            acc[key] = {
              size: v.metadata.processedSize,
              format: v.metadata.outputFormat,
              dimensions: v.metadata.processedDimensions,
              compressionRatio: v.metadata.compressionRatio,
              optimizations: v.optimizations,
            };
            return acc;
          }, {} as Record<string, any>),
        },
      },
    };

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      logger.warn('Image validation warnings', {
        userId: user.id,
        fileName,
        warnings: validationResult.warnings,
      });
    }

    logger.info('Image upload completed', {
      userId: user.id,
      fileId: response.data.id,
      fileName,
      validation: {
        isValid: validationResult.isValid,
        warnings: validationResult.warnings.length,
        dimensions: validationResult.metadata
          ? `${validationResult.metadata.width}x${validationResult.metadata.height}`
          : 'unknown',
      },
    });

    const duration = Date.now() - startTime;
    logger.logResponse(201, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      'Image upload failed',
      error instanceof Error ? error : undefined,
      {
        requestId: context.awsRequestId,
      }
    );

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
