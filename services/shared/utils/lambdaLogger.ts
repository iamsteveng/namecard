import { env } from '../config/env.js';

interface LogContext {
  [key: string]: any;
}

// Lambda-optimized logger that uses console methods for CloudWatch integration
class LambdaLogger {
  private serviceName: string;

  constructor(serviceName = 'namecard-serverless') {
    this.serviceName = serviceName;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
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

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
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

  debug(message: string, context?: LogContext): void {
    if (!env.isProduction) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  // Lambda-specific method for request tracking
  logRequest(method: string, path: string, context?: LogContext): void {
    this.info('Lambda request started', {
      method,
      path,
      requestId: context?.requestId,
      functionName: context?.functionName,
    });
  }

  logResponse(statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    const message = statusCode >= 400 ? 'Lambda request failed' : 'Lambda request completed';

    if (level === 'warn') {
      this.warn(message, {
        statusCode,
        duration: `${duration}ms`,
        ...context,
      });
    } else {
      this.info(message, {
        statusCode,
        duration: `${duration}ms`,
        ...context,
      });
    }
  }

  // Database operation logging
  logDatabaseOperation(operation: string, table: string, duration: number, context?: LogContext): void {
    this.info(`Database ${operation}`, {
      operation,
      table,
      duration: `${duration}ms`,
      ...context,
    });
  }

  // External API call logging
  logExternalApiCall(
    service: string,
    endpoint: string,
    duration: number,
    statusCode: number,
    context?: LogContext
  ): void {
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
    } else {
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

export default logger;

// Export individual methods for convenience
export const { info, warn, error, debug, logRequest, logResponse, logDatabaseOperation, logExternalApiCall } = logger;
