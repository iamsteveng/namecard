// Structured logging utilities following SERVERLESS.md Rule 14
import winston from 'winston';

// Create logger with JSON format for CloudWatch
const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env['AWS_LAMBDA_FUNCTION_NAME'] || 'namecard-service',
    stage: process.env['STAGE'] || 'local',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Structured logging interface
interface LogContext {
  requestId?: string;
  userId?: string;
  functionName?: string;
  [key: string]: any;
}

// Log levels with context
export function logInfo(message: string, context: LogContext = {}) {
  logger.info(message, context);
}

export function logError(message: string, error?: Error | any, context: LogContext = {}) {
  logger.error(message, {
    ...context,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error,
  });
}

export function logWarn(message: string, context: LogContext = {}) {
  logger.warn(message, context);
}

export function logDebug(message: string, context: LogContext = {}) {
  logger.debug(message, context);
}

// Performance logging
export function logPerformance(
  operation: string, 
  duration: number, 
  context: LogContext = {}
) {
  logInfo(`Performance: ${operation}`, {
    ...context,
    operation,
    duration,
    durationMs: `${duration}ms`,
  });
}

// Lambda request logging
export function logRequest(
  method: string,
  path: string,
  context: LogContext = {}
) {
  logInfo('Incoming request', {
    ...context,
    method,
    path,
    timestamp: new Date().toISOString(),
  });
}

// Lambda response logging
export function logResponse(
  statusCode: number,
  duration: number,
  context: LogContext = {}
) {
  logInfo('Request completed', {
    ...context,
    statusCode,
    duration,
    durationMs: `${duration}ms`,
  });
}

// Database operation logging
export function logDatabaseOperation(
  operation: string,
  table: string,
  duration: number,
  context: LogContext = {}
) {
  logInfo(`Database ${operation}`, {
    ...context,
    operation,
    table,
    duration,
    durationMs: `${duration}ms`,
  });
}

// External API logging
export function logExternalApiCall(
  service: string,
  endpoint: string,
  duration: number,
  statusCode?: number,
  context: LogContext = {}
) {
  logInfo(`External API call: ${service}`, {
    ...context,
    service,
    endpoint,
    statusCode,
    duration,
    durationMs: `${duration}ms`,
  });
}

export default logger;