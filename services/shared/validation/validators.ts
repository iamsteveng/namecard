// Validation utilities and middleware
import Joi from 'joi';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ValidationError } from '../utils/errors.js';

// Validate request body
export function validateBody<T>(
  event: APIGatewayProxyEvent,
  schema: Joi.ObjectSchema
): T {
  if (!event.body) {
    throw new ValidationError('Request body is required', 'body');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body', 'body');
  }

  const { error, value } = schema.validate(body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      code: 'VALIDATION_ERROR',
    }));

    // Throw first validation error
    const firstError = validationErrors[0];
    throw new ValidationError(firstError.message, firstError.field, firstError.code);
  }

  return value as T;
}

// Validate path parameters
export function validatePathParams<T>(
  event: APIGatewayProxyEvent,
  schema: Joi.ObjectSchema
): T {
  const params = event.pathParameters || {};

  const { error, value } = schema.validate(params, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const firstError = error.details[0];
    throw new ValidationError(
      firstError.message,
      firstError.path.join('.'),
      'PATH_PARAM_ERROR'
    );
  }

  return value as T;
}

// Validate query parameters
export function validateQueryParams<T>(
  event: APIGatewayProxyEvent,
  schema: Joi.ObjectSchema
): T {
  const params = event.queryStringParameters || {};

  const { error, value } = schema.validate(params, {
    abortEarly: false,
    stripUnknown: true,
    convert: true, // Convert strings to appropriate types
  });

  if (error) {
    const firstError = error.details[0];
    throw new ValidationError(
      firstError.message,
      firstError.path.join('.'),
      'QUERY_PARAM_ERROR'
    );
  }

  return value as T;
}

// Validate multipart form data (for file uploads)
export function validateMultipartData<T>(
  formData: any,
  schema: Joi.ObjectSchema
): T {
  const { error, value } = schema.validate(formData, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const firstError = error.details[0];
    throw new ValidationError(
      firstError.message,
      firstError.path.join('.'),
      'FORM_DATA_ERROR'
    );
  }

  return value as T;
}

// File validation utilities
export function validateFileType(
  contentType: string,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/heic', 'image/webp']
): boolean {
  return allowedTypes.includes(contentType);
}

export function validateFileSize(size: number, maxSize: number = 10485760): boolean {
  return size <= maxSize;
}

// Email validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// URL validation  
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// UUID validation
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Sanitize input
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

// Validate pagination parameters
export function validatePagination(limit?: number, offset?: number): { limit: number; offset: number } {
  const validatedLimit = Math.min(Math.max(limit || 20, 1), 100);
  const validatedOffset = Math.max(offset || 0, 0);
  
  return {
    limit: validatedLimit,
    offset: validatedOffset,
  };
}