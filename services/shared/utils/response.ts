// Lambda response utilities following SERVERLESS.md best practices
import type { APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from '../types/index';

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

// Success response factory
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200,
  message?: string,
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
    ...(message && { message }),
  };

  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}

// Error response factory
export function createErrorResponse(
  error: string | Error,
  statusCode: number = 500,
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  const errorMessage = error instanceof Error ? error.message : error;
  
  const response: ApiResponse = {
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    requestId,
  };

  // Log error for debugging (following SERVERLESS.md Rule 14)
  console.error('API Error:', {
    error: errorMessage,
    statusCode,
    requestId,
    timestamp: response.timestamp,
  });

  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}

// Validation error response
export function createValidationErrorResponse(
  errors: Array<{ field: string; message: string }>,
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  const response: ApiResponse = {
    success: false,
    error: 'Validation failed',
    data: { errors },
    timestamp: new Date().toISOString(),
    requestId,
  };

  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}

// Not found response
export function createNotFoundResponse(
  resource: string = 'Resource',
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  return createErrorResponse(`${resource} not found`, 404, requestId);
}

// Unauthorized response
export function createUnauthorizedResponse(
  message: string = 'Unauthorized',
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  return createErrorResponse(message, 401, requestId);
}

// Forbidden response
export function createForbiddenResponse(
  message: string = 'Forbidden',
  requestId: string = generateRequestId()
): APIGatewayProxyResult {
  return createErrorResponse(message, 403, requestId);
}

// Generate correlation ID for request tracing (SERVERLESS.md Rule 14)
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Extract request ID from event
export function getRequestId(event: any): string {
  return event.requestContext?.requestId || generateRequestId();
}

// Parse JSON body safely
export function parseJsonBody<T = any>(body: string | null): T | null {
  if (!body) return null;
  
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error('Failed to parse JSON body:', error);
    return null;
  }
}

// Extract user ID from path parameters
export function getUserIdFromPath(event: any): string | null {
  return event.pathParameters?.userId || null;
}

// Extract ID from path parameters
export function getIdFromPath(event: any): string | null {
  return event.pathParameters?.id || null;
}

// Extract query string parameters safely
export function getQueryParameter(event: any, key: string, defaultValue?: string): string | undefined {
  const params = event.queryStringParameters || {};
  return params[key] || defaultValue;
}

// Extract and validate pagination parameters
export function getPaginationParams(event: any): { limit: number; offset: number } {
  const limit = Math.min(parseInt(getQueryParameter(event, 'limit', '20') || '20'), 100);
  const offset = Math.max(parseInt(getQueryParameter(event, 'offset', '0') || '0'), 0);
  
  return { limit, offset };
}