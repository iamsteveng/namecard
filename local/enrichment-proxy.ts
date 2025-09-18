// Enrichment service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '../services/shared/utils/response';
import { logRequest, logResponse } from '../services/shared/utils/logger';

// Import actual Lambda handlers
import { handler as healthHandler } from '../services/enrichment/health';
import { handler as sourcesHandler } from '../services/enrichment/sources';

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
    // Extract the route path after /api/v1/local/enrichment/ or handle direct paths
    let routePath = event.path;
    console.log(`DEBUG: Original path: "${event.path}"`);
    
    if (routePath.includes('/api/v1/local/enrichment/')) {
      routePath = routePath.replace('/api/v1/local/enrichment/', '');
    } else if (routePath.includes('/local/enrichment/')) {
      routePath = routePath.replace('/local/enrichment/', '');
    } else {
      // Handle paths like "1/local/enrichment/health" from serverless-offline
      const pathParts = routePath.split('/');
      const enrichmentIndex = pathParts.indexOf('enrichment');
      if (enrichmentIndex !== -1 && enrichmentIndex < pathParts.length - 1) {
        routePath = pathParts.slice(enrichmentIndex + 1).join('/');
      }
    }
    
    console.log(`DEBUG: Parsed route path: "${routePath}"`)
    
    // Route to appropriate handler based on path and method - matching original enrichment routes
    switch (true) {
      case routePath === 'health' && method === 'GET':
        return await healthHandler(event, context);
        
      case routePath === 'sources' && method === 'GET':
        return await sourcesHandler(event, context);
        
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(errorMessage, 500, requestId);
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