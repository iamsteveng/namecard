// Auth service proxy for local development
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createErrorResponse, getRequestId } from '@shared/utils/response';
import { logRequest, logResponse } from '@shared/utils/logger';

// Import auth handlers
import { handler as registerHandler } from '@services/auth/register';
import { handler as loginHandler } from '@services/auth/login';
import { handler as logoutHandler } from '@services/auth/logout';
import { handler as refreshHandler } from '@services/auth/refresh';
import { handler as profileHandler } from '@services/auth/profile';
import { handler as forgotPasswordHandler } from '@services/auth/forgot-password';
import { handler as resetPasswordHandler } from '@services/auth/reset-password';

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
        return await loginHandler(event, context);
        
      case routePath === 'register' && method === 'POST':
        return await registerHandler(event, context);
        
      case routePath === 'refresh' && method === 'POST':
        return await refreshHandler(event, context);
        
      case (routePath === 'profile' && method === 'GET') || (routePath === 'profile' && method === 'PUT'):
        return await profileHandler(event, context);
        
      case routePath === 'logout' && method === 'POST':
        return await logoutHandler(event, context);
        
      case routePath === 'forgot-password' && method === 'POST':
        return await forgotPasswordHandler(event, context);
        
      case routePath === 'reset-password' && method === 'POST':
        return await resetPasswordHandler(event, context);
        
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

