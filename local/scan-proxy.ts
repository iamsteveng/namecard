// OCR/Scan service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response';
import { logRequest, logResponse } from '../services/shared/utils/logger';

// Import actual Lambda handlers
import { handler as textHandler } from '../services/scan/text';
import { handler as analyzeHandler } from '../services/scan/analyze';
import { handler as businessCardHandler } from '../services/scan/business-card';
import { handler as healthHandler } from '../services/scan/health';
import { handler as infoHandler } from '../services/scan/info';

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
    
    // Route to appropriate handler based on path and method - matching original scan routes
    switch (true) {
      case routePath === 'text' && method === 'POST':
        return await textHandler(event, context);
        
      case routePath === 'analyze' && method === 'POST':
        return await analyzeHandler(event, context);
        
      case routePath === 'business-card' && method === 'POST':
        return await businessCardHandler(event, context);
        
      case routePath === 'health' && method === 'GET':
        return await healthHandler(event, context);
        
      case routePath === 'info' && method === 'GET':
        return await infoHandler(event, context);
        
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