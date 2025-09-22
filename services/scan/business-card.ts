import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  textractService,
  parseMultipartFormData,
  findFile,
} from '@namecard/serverless-shared';

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
    let fileName = 'business-card.jpg';
    let mimeType = 'image/jpeg';
    let options: OCRProcessingOptions = {
      useAnalyzeDocument: true,
      enhanceImage: true,
      minConfidence: 50,
      extractStructuredData: true,
    };

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
        fileName = filePart.filename || fileName;
        mimeType = filePart.contentType || mimeType;

        // Optional fields in multipart (treated as text fields)
        if (formData.fields['useAnalyzeDocument']) {
          options.useAnalyzeDocument = formData.fields['useAnalyzeDocument'] !== 'false';
        }
        if (formData.fields['enhanceImage']) {
          options.enhanceImage = formData.fields['enhanceImage'] !== 'false';
        }
        if (formData.fields['minConfidence']) {
          const parsed = parseInt(formData.fields['minConfidence'], 10);
          if (!Number.isNaN(parsed)) {
            options.minConfidence = parsed;
          }
        }
        if (formData.fields['extractStructuredData']) {
          options.extractStructuredData = formData.fields['extractStructuredData'] !== 'false';
        }
      } catch (parseError) {
        logger.warn('Scan business-card multipart parse failed', {
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
        fileName = body.fileName || fileName;
        mimeType = body.mimeType || mimeType;
        const parsedConfidence = parseInt(body.minConfidence ?? '', 10);
        options = {
          useAnalyzeDocument: body.useAnalyzeDocument !== 'false',
          enhanceImage: body.enhanceImage !== 'false',
          minConfidence: Number.isNaN(parsedConfidence) ? options.minConfidence ?? 50 : parsedConfidence,
          extractStructuredData: body.extractStructuredData !== 'false',
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
