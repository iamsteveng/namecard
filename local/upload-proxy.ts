// Upload service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response';
import { logRequest, logResponse } from '../services/shared/utils/logger';

// Import actual Lambda handlers
import { handler as uploadSingleHandler } from '../services/upload/upload-single';
import { handler as uploadMultipleHandler } from '../services/upload/upload-multiple';
import { handler as healthHandler } from '../services/upload/health';

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
    
    // Route to appropriate handler based on path and method - matching original upload routes
    switch (true) {
      case routePath === 'image' && method === 'POST':
        return await uploadSingleHandler(event, context);
        
      case routePath === 'images' && method === 'POST':
        return await uploadMultipleHandler(event, context);
        
      case routePath === 'health' && method === 'GET':
        return await healthHandler(event, context);
        
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