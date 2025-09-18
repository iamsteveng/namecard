// Shared utilities for serverless functions (use explicit .js for ESM runtime)
export { default as getPrismaClient, disconnectPrisma, setupLambdaCleanup } from './lib/lambdaPrisma.js';
export { env } from './config/env.js';
export { default as logger } from './utils/lambdaLogger.js';
export * from './utils/response.js';
export * from './utils/logger.js';

// Lambda utilities (selective re-exports to avoid name collisions)
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

// Services
export { default as cognitoService } from './services/cognito.service.js';
export * from './services/jwt.service.js';
export { default as secretsService } from './services/secrets.service.js';
export { ImagePreprocessingService } from './services/image-preprocessing.service.js';
export { ImageValidationService, AppError } from './services/image-validation.service.js';
export { textractService } from './services/textract.service.js';
export type { OCRResult, BusinessCardData, TextractBlock } from './services/textract.service.js';
