// Custom error classes for better error handling
export class ValidationError extends Error {
  public field: string;
  public code: string;

  constructor(message: string, field: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
  }
}

export class AuthenticationError extends Error {
  public code: string;

  constructor(message: string = 'Authentication required', code: string = 'AUTH_REQUIRED') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

export class AuthorizationError extends Error {
  public code: string;

  constructor(message: string = 'Access denied', code: string = 'ACCESS_DENIED') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
  }
}

export class NotFoundError extends Error {
  public resource: string;
  public code: string;

  constructor(resource: string = 'Resource', code: string = 'NOT_FOUND') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.code = code;
  }
}

export class ConflictError extends Error {
  public code: string;

  constructor(message: string, code: string = 'CONFLICT') {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
  }
}

export class ExternalServiceError extends Error {
  public service: string;
  public statusCode?: number;
  public code: string;

  constructor(
    message: string,
    service: string,
    statusCode?: number,
    code: string = 'EXTERNAL_SERVICE_ERROR'
  ) {
    super(message);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class DatabaseError extends Error {
  public operation: string;
  public code: string;

  constructor(message: string, operation: string, code: string = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.operation = operation;
    this.code = code;
  }
}

// Error code constants
export const ERROR_CODES = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Authentication & Authorization
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // External services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  PERPLEXITY_API_ERROR: 'PERPLEXITY_API_ERROR',
  TEXTRACT_ERROR: 'TEXTRACT_ERROR',
  S3_ERROR: 'S3_ERROR',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // File operations
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
} as const;

// HTTP status code mapping
export function getHttpStatusCode(error: Error): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthorizationError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  if (error instanceof ExternalServiceError) return 502;
  if (error instanceof DatabaseError) return 503;
  
  // Default to 500 for unknown errors
  return 500;
}