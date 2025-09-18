// Auth-specific exports that exclude image processing dependencies
export { default as getPrismaClient, disconnectPrisma, setupLambdaCleanup } from './lib/lambdaPrisma';
export { default as logger } from './utils/lambdaLogger';
export * from './utils/response';
// Selective re-exports from lambda to avoid name collisions with utils/response
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
} from './lambda';

// Services (excluding image processing services)
export { default as cognitoService } from './services/cognito.service';
export * from './services/jwt.service';
export { default as secretsService } from './services/secrets.service';

// Explicitly exclude image processing services that depend on Sharp:
// - ImagePreprocessingService 
// - ImageValidationService
// - textractService
