"use strict";
/**
 * Lambda utilities for NameCard serverless functions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResponse = createResponse;
exports.createSuccessResponse = createSuccessResponse;
exports.createErrorResponse = createErrorResponse;
exports.getRequestId = getRequestId;
exports.logRequest = logRequest;
exports.logResponse = logResponse;
exports.emitMetric = emitMetric;
exports.emitDatabaseConnectionMetric = emitDatabaseConnectionMetric;
exports.emitBusinessMetric = emitBusinessMetric;
exports.lambdaHandler = lambdaHandler;
exports.handleCorsPreflightRequest = handleCorsPreflightRequest;
exports.parseRequestBody = parseRequestBody;
exports.extractBearerToken = extractBearerToken;
exports.validateEnvironmentVariables = validateEnvironmentVariables;
const aws_xray_sdk_core_1 = __importDefault(require("aws-xray-sdk-core"));
const aws_sdk_1 = require("aws-sdk");
// Initialize AWS SDK with X-Ray tracing
const cloudwatch = aws_xray_sdk_core_1.default.captureAWSClient(new aws_sdk_1.CloudWatch());
/**
 * Create a standardized API Gateway response
 */
function createResponse(statusCode, body, headers = {}) {
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
function createSuccessResponse(data, message = 'Success', statusCode = 200) {
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
function createErrorResponse(message, statusCode = 500, error) {
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
function getRequestId(event, context) {
    return event.requestContext?.requestId || context?.awsRequestId || 'unknown';
}
/**
 * Log request information
 */
function logRequest(method, path, metadata = {}) {
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
function logResponse(statusCode, duration, metadata = {}) {
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
async function emitMetric(metric) {
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
        await cloudwatch.putMetricData(params).promise();
    }
    catch (error) {
        console.error('Failed to emit custom metric:', error);
    }
}
/**
 * Emit database connection metric
 */
async function emitDatabaseConnectionMetric(activeConnections) {
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
async function emitBusinessMetric(eventName, count = 1) {
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
function lambdaHandler(handler, options = {}) {
    return async (event, context) => {
        const startTime = Date.now();
        const requestId = getRequestId(event, context);
        const method = event.httpMethod;
        const path = event.path;
        // Log request
        logRequest(method, path, { requestId, functionName: context.functionName });
        let response;
        try {
            // Create X-Ray subsegment if enabled
            if (options.enableXRay) {
                const segment = aws_xray_sdk_core_1.default.getSegment();
                const subsegment = segment?.addNewSubsegment('lambda-handler');
                subsegment?.addAnnotation('method', method);
                subsegment?.addAnnotation('path', path);
                subsegment?.addAnnotation('functionName', context.functionName);
                try {
                    response = await handler(event, context);
                    subsegment?.close();
                }
                catch (error) {
                    subsegment?.addError(error);
                    subsegment?.close();
                    throw error;
                }
            }
            else {
                response = await handler(event, context);
            }
        }
        catch (error) {
            console.error('Lambda handler error:', error);
            // Emit error metric
            await emitMetric({
                name: 'Errors',
                value: 1,
                unit: 'Count',
                namespace: 'NameCard/Lambda',
            });
            response = createErrorResponse('Internal server error', 500, error instanceof Error ? error.message : 'Unknown error');
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
function handleCorsPreflightRequest(event) {
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
function parseRequestBody(event) {
    if (!event.body) {
        return {};
    }
    try {
        return JSON.parse(event.body);
    }
    catch (error) {
        console.error('Failed to parse request body:', error);
        throw new Error('Invalid JSON in request body');
    }
}
/**
 * Extract JWT token from Authorization header
 */
function extractBearerToken(event) {
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
function validateEnvironmentVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
