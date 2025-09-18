import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { logger, ImageValidationService, ImagePreprocessingService } from '@namecard/serverless-shared';

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
    const businessCardConfig = ImageValidationService.getConfigForUseCase('business-card');
    const storageOptions = ImagePreprocessingService.getOptionsForUseCase('storage');

    const response = {
      success: true,
      service: 'Upload Service with Advanced Validation',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: {
        singleUpload: true,
        multipleUpload: true,
        batchValidation: true,
        batchProcessing: true,
        comprehensiveValidation: true,
        imagePreprocessing: true,
        variantGeneration: true,
        securityChecks: true,
        maxFileSize: `${(businessCardConfig.maxFileSize / 1024 / 1024).toFixed(0)}MB`,
        maxFiles: businessCardConfig.maxFiles,
        supportedFormats: businessCardConfig.allowedFormats,
        validation: {
          imageDimensions: true,
          aspectRatio: true,
          fileSignature: true,
          contentSecurity: true,
          qualityAnalysis: true,
        },
        preprocessing: {
          purposes: ['storage', 'ocr', 'thumbnail', 'avatar', 'web-display'],
          optimizations: ['resizing', 'format-conversion', 'compression', 'enhancement'],
          outputFormats: ['jpeg', 'png', 'webp'],
          variantCreation: true,
          batchProcessing: true,
          qualityControl: true,
        },
        useCases: ['business-card', 'profile-avatar', 'document', 'general'],
      },
      performance: {
        defaultQuality: storageOptions.quality,
        maxDimensions: `${storageOptions.maxWidth}x${storageOptions.maxHeight}`,
        concurrentProcessing: 3,
        autoFormatSelection: true,
        metadataRemoval: storageOptions.removeMetadata,
      },
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
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      'Upload service health check failed',
      error instanceof Error ? error : undefined,
      {
        requestId: context.awsRequestId,
      }
    );

    logger.logResponse(500, duration, {
      requestId: context.awsRequestId,
      functionName: context.functionName,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        service: 'Upload Service',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      }),
    };
  }
};
