// Upload service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response';
import { logRequest, logResponse } from '../services/shared/utils/logger';

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
    // Extract the route path after /api/v1/upload/
    const routePath = event.path.replace('/api/v1/upload/', '').replace('/api/v1/upload', '');
    
    // Route to appropriate handler based on path and method
    switch (true) {
      case routePath === 'single' && method === 'POST':
        return await handleSingle(event, requestId);
        
      case routePath === 'batch' && method === 'POST':
        return await handleBatch(event, requestId);
        
      case routePath === 'presigned-url' && method === 'POST':
        return await handlePresignedUrl(event, requestId);
        
      case routePath === 'validate' && method === 'POST':
        return await handleValidate(event, requestId);
        
      default:
        return createErrorResponse(`Route not found: ${method} ${routePath}`, 404, requestId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(errorMessage, 500, requestId);
  } finally {
    const duration = Date.now() - startTime;
    logResponse(200, duration, { requestId, functionName: context.functionName });
  }
};

// Temporary mock handlers - will be replaced with actual service logic
async function handleSingle(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Single upload endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Upload proxy working',
    requestId
  );
}

async function handleBatch(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Batch upload endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Upload proxy working',
    requestId
  );
}

async function handlePresignedUrl(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Presigned URL endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Upload proxy working',
    requestId
  );
}

async function handleValidate(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Validate upload endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Upload proxy working',
    requestId
  );
}