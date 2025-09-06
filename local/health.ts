// Health check handler for local development
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response.js';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const requestId = getRequestId(event);

  try {
    const healthData = {
      status: 'healthy',
      environment: process.env.NODE_ENV || 'local',
      stage: process.env.STAGE || 'local',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: {
        auth: 'available',
        cards: 'available',
        upload: 'available',
        ocr: 'available',
        enrichment: 'available',
      },
      database: {
        status: 'not checked in local proxy',
      },
    };

    return createSuccessResponse(
      healthData,
      200,
      'Service is healthy',
      requestId
    );
  } catch (error) {
    return createErrorResponse(error, 500, requestId);
  }
};