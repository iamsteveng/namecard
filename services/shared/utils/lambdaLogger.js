"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logExternalApiCall = exports.logDatabaseOperation = exports.logResponse = exports.logRequest = exports.debug = exports.error = exports.warn = exports.info = void 0;
const env_1 = require("@shared/config/env");
// Lambda-optimized logger that uses console methods for CloudWatch integration
class LambdaLogger {
    constructor(serviceName = 'namecard-serverless') {
        this.serviceName = serviceName;
    }
    formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            service: this.serviceName,
            message,
            ...context,
        };
        return JSON.stringify(logEntry);
    }
    info(message, context) {
        console.log(this.formatMessage('info', message, context));
    }
    warn(message, context) {
        console.warn(this.formatMessage('warn', message, context));
    }
    error(message, error, context) {
        const errorContext = error
            ? {
                ...context,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                },
            }
            : context;
        console.error(this.formatMessage('error', message, errorContext));
    }
    debug(message, context) {
        if (!env_1.env.isProduction) {
            console.debug(this.formatMessage('debug', message, context));
        }
    }
    // Lambda-specific method for request tracking
    logRequest(method, path, context) {
        this.info('Lambda request started', {
            method,
            path,
            requestId: context?.requestId,
            functionName: context?.functionName,
        });
    }
    logResponse(statusCode, duration, context) {
        const level = statusCode >= 400 ? 'warn' : 'info';
        const message = statusCode >= 400 ? 'Lambda request failed' : 'Lambda request completed';
        if (level === 'warn') {
            this.warn(message, {
                statusCode,
                duration: `${duration}ms`,
                ...context,
            });
        }
        else {
            this.info(message, {
                statusCode,
                duration: `${duration}ms`,
                ...context,
            });
        }
    }
    // Database operation logging
    logDatabaseOperation(operation, table, duration, context) {
        this.info(`Database ${operation}`, {
            operation,
            table,
            duration: `${duration}ms`,
            ...context,
        });
    }
    // External API call logging
    logExternalApiCall(service, endpoint, duration, statusCode, context) {
        const level = statusCode >= 400 ? 'warn' : 'info';
        const message = `External API call: ${service}`;
        if (level === 'warn') {
            this.warn(message, {
                service,
                endpoint,
                statusCode,
                duration: `${duration}ms`,
                ...context,
            });
        }
        else {
            this.info(message, {
                service,
                endpoint,
                statusCode,
                duration: `${duration}ms`,
                ...context,
            });
        }
    }
}
// Create and export singleton instance
const logger = new LambdaLogger();
exports.default = logger;
// Export individual methods for convenience
exports.info = logger.info, exports.warn = logger.warn, exports.error = logger.error, exports.debug = logger.debug, exports.logRequest = logger.logRequest, exports.logResponse = logger.logResponse, exports.logDatabaseOperation = logger.logDatabaseOperation, exports.logExternalApiCall = logger.logExternalApiCall;
