"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSuccessResponse = createSuccessResponse;
exports.createErrorResponse = createErrorResponse;
exports.createValidationErrorResponse = createValidationErrorResponse;
exports.createNotFoundResponse = createNotFoundResponse;
exports.createUnauthorizedResponse = createUnauthorizedResponse;
exports.createForbiddenResponse = createForbiddenResponse;
exports.generateRequestId = generateRequestId;
exports.getRequestId = getRequestId;
exports.parseJsonBody = parseJsonBody;
exports.getUserIdFromPath = getUserIdFromPath;
exports.getIdFromPath = getIdFromPath;
exports.getQueryParameter = getQueryParameter;
exports.getPaginationParams = getPaginationParams;
// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    'Content-Type': 'application/json',
};
// Success response factory
function createSuccessResponse(data, statusCode = 200, message, requestId = generateRequestId()) {
    const response = {
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
function createErrorResponse(error, statusCode = 500, requestId = generateRequestId()) {
    const errorMessage = error instanceof Error ? error.message : error;
    const response = {
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
function createValidationErrorResponse(errors, requestId = generateRequestId()) {
    const response = {
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
function createNotFoundResponse(resource = 'Resource', requestId = generateRequestId()) {
    return createErrorResponse(`${resource} not found`, 404, requestId);
}
// Unauthorized response
function createUnauthorizedResponse(message = 'Unauthorized', requestId = generateRequestId()) {
    return createErrorResponse(message, 401, requestId);
}
// Forbidden response
function createForbiddenResponse(message = 'Forbidden', requestId = generateRequestId()) {
    return createErrorResponse(message, 403, requestId);
}
// Generate correlation ID for request tracing (SERVERLESS.md Rule 14)
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
// Extract request ID from event
function getRequestId(event) {
    return event.requestContext?.requestId || generateRequestId();
}
// Parse JSON body safely
function parseJsonBody(body) {
    if (!body)
        return null;
    try {
        return JSON.parse(body);
    }
    catch (error) {
        console.error('Failed to parse JSON body:', error);
        return null;
    }
}
// Extract user ID from path parameters
function getUserIdFromPath(event) {
    return event.pathParameters?.userId || null;
}
// Extract ID from path parameters
function getIdFromPath(event) {
    return event.pathParameters?.id || null;
}
// Extract query string parameters safely
function getQueryParameter(event, key, defaultValue) {
    const params = event.queryStringParameters || {};
    return params[key] || defaultValue;
}
// Extract and validate pagination parameters
function getPaginationParams(event) {
    const limit = Math.min(parseInt(getQueryParameter(event, 'limit', '20') || '20'), 100);
    const offset = Math.max(parseInt(getQueryParameter(event, 'offset', '0') || '0'), 0);
    return { limit, offset };
}
