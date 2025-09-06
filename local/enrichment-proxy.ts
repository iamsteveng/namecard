// Enrichment service proxy for local development
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
    // Extract the route path after /api/v1/enrichment/
    const routePath = event.path.replace('/api/v1/enrichment/', '').replace('/api/v1/enrichment', '');
    
    // Route to appropriate handler based on path and method
    switch (true) {
      case routePath === 'enrich' && method === 'POST':
        return await handleEnrich(event, requestId);
        
      case routePath === 'perplexity-lookup' && method === 'POST':
        return await handlePerplexityLookup(event, requestId);
        
      case routePath === 'refresh' && method === 'POST':
        return await handleRefresh(event, requestId);
        
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
async function handleEnrich(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Enrich card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Enrichment proxy working',
    requestId
  );
}

async function handlePerplexityLookup(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Perplexity lookup endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Enrichment proxy working',
    requestId
  );
}

async function handleRefresh(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Refresh enrichment endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Enrichment proxy working',
    requestId
  );
}