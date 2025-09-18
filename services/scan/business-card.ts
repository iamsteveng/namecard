import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { logger, textractService } from '@namecard/serverless-shared';

// OCR Processing Options interface
interface OCRProcessingOptions {
  useAnalyzeDocument?: boolean;
  enhanceImage?: boolean;
  minConfidence?: number;
  extractStructuredData?: boolean;
}

// OCR Scan Response interface
interface OCRScanResponse {
  success: boolean;
  data: {
    cardId: string;
    extractedData: any;
    ocrResult: any;
    processingTime: number;
  };
  timestamp: string;
}

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

    // Parse file data and options from Lambda event body
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
    let options: OCRProcessingOptions = {};

    try {
      // This is a simplified implementation for Lambda
      const body = JSON.parse(event.body);
      fileBuffer = Buffer.from(body.file, 'base64');
      fileName = body.fileName || 'business-card.jpg';
      mimeType = body.mimeType || 'image/jpeg';
      
      // Parse processing options
      options = {
        useAnalyzeDocument: body.useAnalyzeDocument !== 'false', // Default to true
        enhanceImage: body.enhanceImage !== 'false', // Default to true
        minConfidence: parseInt(body.minConfidence) || 50,
        extractStructuredData: body.extractStructuredData !== 'false', // Default to true
      };
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

    logger.info('Starting business card scanning', {
      userId: user.id,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
      options,
    });

    // Extract text using the appropriate method
    const ocrResult = options.useAnalyzeDocument
      ? await textractService.extractText(fileBuffer, mimeType)
      : await textractService.detectText(fileBuffer, mimeType);

    // Parse business card data
    const businessCardData = textractService.parseBusinessCard(ocrResult);
    const processingTime = Date.now() - startTime;

    logger.info('Business card scanning completed', {
      userId: user.id,
      processingTime,
      confidence: ocrResult.confidence.toFixed(1),
      extractedFields: Object.keys(businessCardData).filter(
        key => key !== 'rawText' && key !== 'confidence'
      ).length,
      hasName: !!businessCardData.name,
      hasEmail: !!businessCardData.email,
      hasCompany: !!businessCardData.company,
    });

    const response: OCRScanResponse = {
      success: true,
      data: {
        cardId: `temp_${Date.now()}`, // Temporary ID until saved to database
        extractedData: businessCardData,
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
      'Business card scanning failed',
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
        error: error.message || 'Business card scanning failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
