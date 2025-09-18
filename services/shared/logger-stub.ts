type LogContext = Record<string, any>;

const logger = {
  info(message: string, context?: LogContext) {
    console.log(JSON.stringify({ level: 'INFO', message, ...context }));
  },
  warn(message: string, context?: LogContext) {
    console.warn(JSON.stringify({ level: 'WARN', message, ...context }));
  },
  error(message: string, error?: Error, context?: LogContext) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message,
        error: error ? { message: error.message, stack: error.stack } : undefined,
        ...context,
      })
    );
  },
  debug(message: string, context?: LogContext) {
    console.debug(JSON.stringify({ level: 'DEBUG', message, ...context }));
  },
  logRequest(method: string, path: string, context?: LogContext) {
    console.log(JSON.stringify({ level: 'INFO', type: 'request', method, path, ...context }));
  },
  logResponse(statusCode: number, duration: number, context?: LogContext) {
    console.log(
      JSON.stringify({ level: 'INFO', type: 'response', statusCode, duration: `${duration}ms`, ...context })
    );
  },
};

export default logger;

