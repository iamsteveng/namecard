// Lightweight runtime exports without DB/secrets dependencies
export { default as logger } from './utils/lambdaLogger.js';
export * from './utils/response.js';
export * from './utils/logger.js';
export {
  lambdaHandler,
  handleCorsPreflightRequest,
  parseRequestBody,
  extractBearerToken,
  validateEnvironmentVariables,
  emitMetric,
  emitDatabaseConnectionMetric,
  emitBusinessMetric,
  createResponse,
  logRequest,
  logResponse,
  getRequestId,
} from './lambda.js';

// Note: keep this lite to avoid pulling in optional deps during local tests
