// Auth service proxy for local development
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
    // Extract the route path after the auth prefix (handle serverless-offline path format)
    const routePath = event.path
      .replace('/api/v1/local/auth/', '')
      .replace('/api/v1/local/auth', '')
      .replace('1/local/auth/', '')
      .replace('1/local/auth', '');
    
    // Route to appropriate handler based on path and method
    switch (true) {
      case routePath === 'login' && method === 'POST':
        return await handleLogin(event, requestId);
        
      case routePath === 'register' && method === 'POST':
        return await handleRegister(event, requestId);
        
      case routePath === 'refresh' && method === 'POST':
        return await handleRefresh(event, requestId);
        
      case routePath === 'profile' && method === 'GET':
        return await handleProfile(event, requestId);
        
      case routePath === 'logout' && method === 'POST':
        return await handleLogout(event, requestId);
        
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
async function handleLogin(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Login endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Auth proxy working',
    requestId
  );
}

async function handleRegister(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Register endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Auth proxy working',
    requestId
  );
}

async function handleRefresh(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Refresh endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Auth proxy working',
    requestId
  );
}

async function handleProfile(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Profile endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Auth proxy working',
    requestId
  );
}

async function handleLogout(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  return createSuccessResponse(
    {
      message: 'Logout endpoint - to be implemented',
      path: event.path,
      method: event.httpMethod,
    },
    200,
    'Auth proxy working',
    requestId
  );
}