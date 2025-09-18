import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  ImageValidationService,
  ImagePreprocessingService,
  AppError,
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

    // Parse multipart form data from Lambda event
    if (!event.body || !event.headers['content-type']?.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'No image files provided',
        }),
      };
    }

    // For Lambda, parse multiple files from the body
    let files: Array<{
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];

    try {
      // This is a simplified implementation
      // In practice, you'd need proper multipart parsing
      const body = JSON.parse(event.body);
      files = body.files.map((file: any) => ({
        buffer: Buffer.from(file.data, 'base64'),
        originalName: file.fileName || 'upload.jpg',
        mimeType: file.mimeType || 'image/jpeg',
        size: Buffer.from(file.data, 'base64').length,
      }));
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

    logger.info('Multiple images upload received', {
      userId: user.id,
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
    });

    // Comprehensive batch validation
    const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
    const fileData = files.map(file => ({
      buffer: file.buffer,
      originalName: file.originalName,
    }));

    const batchValidationResult = await ImageValidationService.validateImages(
      fileData,
      validationConfig
    );

    // Check if batch validation failed
    if (!batchValidationResult.overallValid) {
      const invalidFiles = batchValidationResult.results
        .map((result, index) => ({
          file: files[index]?.originalName || 'unknown',
          errors: result.errors,
        }))
        .filter(item => item.errors.length > 0);

      const errorMessage = invalidFiles
        .map(item => `${item.file}: ${item.errors.join(', ')}`)
        .join('; ');

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: `Batch validation failed for ${invalidFiles.length} file(s): ${errorMessage}`,
        }),
      };
    }

    // Process each file with validation and preprocessing
    const imageData = files.map(file => ({
      buffer: file.buffer,
      name: file.originalName,
    }));

    // Batch preprocessing for efficiency
    const batchProcessingResults = await ImagePreprocessingService.processBatch(imageData, {
      purpose: 'storage',
    });

    const uploadedFiles = files.map((file, index) => {
      const validationResult = batchValidationResult.results[index] || {
        isValid: true,
        warnings: [],
        metadata: undefined as any,
      };
      const processingResult = batchProcessingResults.find(r => r.name === file.originalName);

      logger.debug('Processing file in batch', {
        index: index + 1,
        fileName: file.originalName,
        fileSize: file.size,
        mimeType: file.mimeType,
        isValid: validationResult.isValid,
        warnings: validationResult.warnings.length,
        processed: !!processingResult?.result,
      });

      const baseData = {
        id: `temp_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        uploadedAt: new Date().toISOString(),
        validation: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings,
          metadata: validationResult.metadata,
        },
      };

      // Add processing results if successful
      if (processingResult?.result) {
        return {
          ...baseData,
          status: 'processed',
          processing: {
            size: processingResult.result.metadata.processedSize,
            format: processingResult.result.metadata.outputFormat,
            dimensions: processingResult.result.metadata.processedDimensions,
            compressionRatio: processingResult.result.metadata.compressionRatio,
            processingTime: processingResult.result.metadata.processingTime,
            optimizations: processingResult.result.optimizations,
            warnings: processingResult.result.warnings,
          },
        };
      } else {
        return {
          ...baseData,
          status: 'validated',
          processing: {
            error: processingResult?.error || 'Processing failed',
          },
        };
      }
    });

    const processedFiles = uploadedFiles.filter(f => f.status === 'processed').length;
    const processingErrors = uploadedFiles.filter(
      f => f.status === 'validated' && f.processing?.error
    ).length;

    const response = {
      success: true,
      message: `${files.length} images uploaded, validated, and processed successfully`,
      data: {
        files: uploadedFiles,
        totalFiles: files.length,
        validFiles: batchValidationResult.results.filter(r => r.isValid).length,
        processedFiles,
        processingErrors,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        uploadedBy: user.id,
        validation: {
          summary: batchValidationResult.summary,
          overallValid: batchValidationResult.overallValid,
        },
        processing: {
          summary: `${processedFiles}/${files.length} files processed successfully`,
          totalProcessingTime: batchProcessingResults
            .filter(r => r.result)
            .reduce((sum, r) => sum + (r.result?.metadata.processingTime || 0), 0),
        },
      },
    };

    logger.info('Multiple images upload completed', {
      userId: user.id,
      fileCount: files.length,
      fileIds: uploadedFiles.map(f => f.id),
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
      'Multiple images upload failed',
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
        message: 'Multiple images upload failed',
      }),
    };
  }
};
