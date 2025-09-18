"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfo = logInfo;
exports.logError = logError;
exports.logWarn = logWarn;
exports.logDebug = logDebug;
exports.logPerformance = logPerformance;
exports.logRequest = logRequest;
exports.logResponse = logResponse;
exports.logDatabaseOperation = logDatabaseOperation;
exports.logExternalApiCall = logExternalApiCall;
// Structured logging utilities following SERVERLESS.md Rule 14
const winston_1 = __importDefault(require("winston"));
// Create logger with JSON format for CloudWatch
const logger = winston_1.default.createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: {
        service: process.env['AWS_LAMBDA_FUNCTION_NAME'] || 'namecard-service',
        stage: process.env['STAGE'] || 'local',
    },
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ],
});
// Log levels with context
function logInfo(message, context = {}) {
    logger.info(message, context);
}
function logError(message, error, context = {}) {
    logger.error(message, {
        ...context,
        error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
        } : error,
    });
}
function logWarn(message, context = {}) {
    logger.warn(message, context);
}
function logDebug(message, context = {}) {
    logger.debug(message, context);
}
// Performance logging
function logPerformance(operation, duration, context = {}) {
    logInfo(`Performance: ${operation}`, {
        ...context,
        operation,
        duration,
        durationMs: `${duration}ms`,
    });
}
// Lambda request logging
function logRequest(method, path, context = {}) {
    logInfo('Incoming request', {
        ...context,
        method,
        path,
        timestamp: new Date().toISOString(),
    });
}
// Lambda response logging
function logResponse(statusCode, duration, context = {}) {
    logInfo('Request completed', {
        ...context,
        statusCode,
        duration,
        durationMs: `${duration}ms`,
    });
}
// Database operation logging
function logDatabaseOperation(operation, table, duration, context = {}) {
    logInfo(`Database ${operation}`, {
        ...context,
        operation,
        table,
        duration,
        durationMs: `${duration}ms`,
    });
}
// External API logging
function logExternalApiCall(service, endpoint, duration, statusCode, context = {}) {
    logInfo(`External API call: ${service}`, {
        ...context,
        service,
        endpoint,
        statusCode,
        duration,
        durationMs: `${duration}ms`,
    });
}
exports.default = logger;
