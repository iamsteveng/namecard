import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    stack?: string;
    details?: any;
  };
  timestamp: string;
  path: string;
}

// Handle different types of errors
const handleDatabaseError = (error: any): AppError => {
  if (error.code === 'P2002') {
    return new AppError('Duplicate field value', 400);
  }
  if (error.code === 'P2025') {
    return new AppError('Record not found', 404);
  }
  return new AppError('Database operation failed', 500);
};

const handleValidationError = (error: any): AppError => {
  const message = error.details?.map((detail: any) => detail.message).join(', ') || 'Validation failed';
  return new AppError(message, 400);
};

const handleJWTError = (): AppError => {
  return new AppError('Invalid token', 401);
};

const handleJWTExpiredError = (): AppError => {
  return new AppError('Token expired', 401);
};

// Convert unknown errors to AppError
const normalizeError = (error: any): AppError => {
  // Prisma errors
  if (error.code && error.code.startsWith('P')) {
    return handleDatabaseError(error);
  }

  // Joi validation errors
  if (error.isJoi) {
    return handleValidationError(error);
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return handleJWTError();
  }
  if (error.name === 'TokenExpiredError') {
    return handleJWTExpiredError();
  }

  // If it's already an AppError, return as-is
  if (error instanceof AppError) {
    return error;
  }

  // Generic server error
  return new AppError(error.message || 'Internal server error', 500, false);
};

// Main error handling middleware
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const normalizedError = normalizeError(error);
  
  // Log error
  if (normalizedError.statusCode >= 500) {
    logger.error('Server error', {
      message: normalizedError.message,
      stack: normalizedError.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn('Client error', {
      message: normalizedError.message,
      url: req.url,
      method: req.method,
      statusCode: normalizedError.statusCode,
    });
  }

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message: normalizedError.message,
    },
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Include stack trace in development
  if (env.isDevelopment && normalizedError.stack) {
    errorResponse.error.stack = normalizedError.stack;
  }

  res.status(normalizedError.statusCode).json(errorResponse);
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const message = `Route ${req.method} ${req.path} not found`;
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: {
      message,
    },
    timestamp: new Date().toISOString(),
    path: req.path,
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};