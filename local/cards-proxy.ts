// Cards service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse, getRequestId } from '@shared/utils/response';
import { logRequest, logResponse } from '@shared/utils/logger';

// Import cards handlers
import { handler as listHandler } from '@services/cards/list';
import { handler as getByIdHandler } from '@services/cards/get-by-id';

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
    // Extract the route path after the cards prefix (handle serverless-offline path format)
    const routePath = event.path
      .replace('/api/v1/local/cards/', '')
      .replace('/api/v1/local/cards', '')
      .replace('1/local/cards/', '')
      .replace('1/local/cards', '');
    
    // Route to appropriate handler based on path and method
    switch (true) {
      case routePath === '' && method === 'POST':
        return await handleCreate(event, requestId);
        
      case routePath === '' && method === 'GET':
        return await listHandler(event, context);
        
      case routePath === 'search' && method === 'GET':
        return await handleSearch(event, requestId);
        
      case routePath.match(/^[0-9a-f-]+$/) && method === 'GET':
        return await getByIdHandler(event, context);
        
      case routePath.match(/^[0-9a-f-]+$/) && method === 'PUT':
        return await handleUpdate(event, requestId);
        
      case routePath.match(/^[0-9a-f-]+$/) && method === 'DELETE':
        return await handleDelete(event, requestId);
        
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
async function handleCreate(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Create card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Cards proxy working',
    requestId
  );
}

async function handleList(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'List cards endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
      queryParams: event.queryStringParameters,
    },
    200,
    'Cards proxy working',
    requestId
  );
}

async function handleGet(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Get card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
      cardId: event.pathParameters?.['proxy'] || event.path.split('/').pop(),
    },
    200,
    'Cards proxy working',
    requestId
  );
}

async function handleUpdate(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Update card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
      cardId: event.pathParameters?.['proxy'] || event.path.split('/').pop(),
    },
    200,
    'Cards proxy working',
    requestId
  );
}

async function handleDelete(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Delete card endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
      cardId: event.pathParameters?.['proxy'] || event.path.split('/').pop(),
    },
    200,
    'Cards proxy working',
    requestId
  );
}

async function handleSearch(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Search cards endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
      queryParams: event.queryStringParameters,
    },
    200,
    'Cards proxy working',
    requestId
  );
}