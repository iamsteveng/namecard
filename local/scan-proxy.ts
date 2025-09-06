// OCR/Scan service proxy for local development
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response.js';
import { logRequest, logResponse } from '../services/shared/utils/logger.js';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);
  const method = event.httpMethod;
  const path = event.path;

  logRequest(method, path, { requestId, functionName: context.functionName });

  try {
    // Extract the route path after /api/v1/scan/
    const routePath = event.path.replace('/api/v1/scan/', '').replace('/api/v1/scan', '');
    
    // Route to appropriate handler based on path and method
    switch (true) {
      case routePath === 'extract-text' && method === 'POST':
        return await handleExtractText(event, requestId);
        
      case routePath === 'analyze-card' && method === 'POST':
        return await handleAnalyzeCard(event, requestId);
        
      case routePath === 'preprocess' && method === 'POST':
        return await handlePreprocess(event, requestId);
        
      default:
        return createErrorResponse(`Route not found: ${method} ${routePath}`, 404, requestId);
    }
  } catch (error) {
    return createErrorResponse(error, 500, requestId);
  } finally {
    const duration = Date.now() - startTime;
    logResponse(200, duration, { requestId, functionName: context.functionName });
  }
};

// Temporary mock handlers - will be replaced with actual service logic
async function handleExtractText(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Extract text endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'OCR proxy working',
    requestId
  );
}

async function handleAnalyzeCard(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Analyze card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'OCR proxy working',
    requestId
  );
}

async function handlePreprocess(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Preprocess image endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'OCR proxy working',
    requestId
  );
}