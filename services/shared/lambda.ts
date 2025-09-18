/**
 * Lambda utilities for NameCard serverless functions
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import AWSXRay from 'aws-xray-sdk-core';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// Initialize CloudWatch client (v3 SDK). X-Ray capture for v3 can be added via middleware if needed.
const cloudwatch = new CloudWatchClient({});

export interface LambdaHandlerOptions {
  enableXRay?: boolean;
  enableCustomMetrics?: boolean;
  timeout?: number;
}

export interface CustomMetric {
  name: string;
  value: number;
  unit: 'Count' | 'Seconds' | 'Percent' | 'Bytes';
  namespace?: string;
}

/**
 * Create a standardized API Gateway response
 */
export function createResponse(
  statusCode: number,
  body: any,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Serverless-Migration': 'lambda-functions',
      'X-Migration-Date': new Date().toISOString().split('T')[0],
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create a success response
 */
export function createSuccessResponse(
  data: any,
  message: string = 'Success',
  statusCode: number = 200
): APIGatewayProxyResult {
  return createResponse(statusCode, {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create an error response
 */
export function createErrorResponse(
  message: string,
  statusCode: number = 500,
  error?: string
): APIGatewayProxyResult {
  return createResponse(statusCode, {
    success: false,
    message,
    error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Extract request ID from event or context
 */
export function getRequestId(event: APIGatewayProxyEvent, context?: Context): string {
  return event.requestContext?.requestId || context?.awsRequestId || 'unknown';
}

/**
 * Log request information
 */
export function logRequest(method: string, path: string, metadata: any = {}): void {
  console.log(JSON.stringify({
    type: 'request',
    method,
    path,
    timestamp: new Date().toISOString(),
    ...metadata,
  }));
}

/**
 * Log response information
 */
export function logResponse(statusCode: number, duration: number, metadata: any = {}): void {
  console.log(JSON.stringify({
    type: 'response',
    statusCode,
    duration,
    timestamp: new Date().toISOString(),
    ...metadata,
  }));
}

/**
 * Emit custom CloudWatch metric
 */
export async function emitMetric(metric: CustomMetric): Promise<void> {
  if (!process.env.ENABLE_CUSTOM_METRICS) {
    return;
  }

  try {
    const params = {
      Namespace: metric.namespace || process.env.CUSTOM_METRICS_NAMESPACE || 'NameCard/Business',
      MetricData: [
        {
          MetricName: metric.name,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: new Date(),
        },
      ],
    };

    await cloudwatch.send(new PutMetricDataCommand(params as any));
  } catch (error) {
    console.error('Failed to emit custom metric:', error);
  }
}

/**
 * Emit database connection metric
 */
export async function emitDatabaseConnectionMetric(activeConnections: number): Promise<void> {
  console.log(JSON.stringify({
    eventType: 'DB_CONNECTION',
    activeConnections,
    timestamp: new Date().toISOString(),
  }));

  await emitMetric({
    name: 'ActiveConnections',
    value: activeConnections,
    unit: 'Count',
    namespace: 'NameCard/Database',
  });
}

/**
 * Emit business metric
 */
export async function emitBusinessMetric(eventName: string, count: number = 1): Promise<void> {
  console.log(JSON.stringify({
    eventType: 'BUSINESS_METRIC',
    eventName,
    count,
    timestamp: new Date().toISOString(),
  }));

  await emitMetric({
    name: eventName,
    value: count,
    unit: 'Count',
  });
}

/**
 * Lambda handler wrapper with built-in error handling, logging, and metrics
 */
export function lambdaHandler(
  handler: (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>,
  options: LambdaHandlerOptions = {}
) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const startTime = Date.now();
    const requestId = getRequestId(event, context);
    const method = event.httpMethod;
    const path = event.path;

    // Log request
    logRequest(method, path, { requestId, functionName: context.functionName });

    let response: APIGatewayProxyResult;

    try {
      // Create X-Ray subsegment if enabled
      if (options.enableXRay) {
        const segment = AWSXRay.getSegment();
        const subsegment = segment?.addNewSubsegment('lambda-handler');
        subsegment?.addAnnotation('method', method);
        subsegment?.addAnnotation('path', path);
        subsegment?.addAnnotation('functionName', context.functionName);

        try {
          response = await handler(event, context);
          subsegment?.close();
        } catch (error) {
          subsegment?.addError(error as Error);
          subsegment?.close();
          throw error;
        }
      } else {
        response = await handler(event, context);
      }
    } catch (error) {
      console.error('Lambda handler error:', error);
      
      // Emit error metric
      await emitMetric({
        name: 'Errors',
        value: 1,
        unit: 'Count',
        namespace: 'NameCard/Lambda',
      });

      response = createErrorResponse(
        'Internal server error',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    const duration = Date.now() - startTime;

    // Log response
    logResponse(response.statusCode, duration, { 
      requestId, 
      functionName: context.functionName 
    });

    // Emit duration metric
    if (options.enableCustomMetrics) {
      await emitMetric({
        name: 'Duration',
        value: duration,
        unit: 'Seconds',
        namespace: 'NameCard/Lambda',
      });
    }

    return response;
  };
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightRequest(event: APIGatewayProxyEvent): APIGatewayProxyResult | null {
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
  }
  return null;
}

/**
 * Parse request body safely
 */
export function parseRequestBody(event: APIGatewayProxyEvent): any {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    console.error('Failed to parse request body:', error);
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Extract JWT token from Authorization header
 */
export function extractBearerToken(event: APIGatewayProxyEvent): string | null {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
