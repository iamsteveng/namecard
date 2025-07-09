import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error.middleware.js';

// type ValidationSource = 'body' | 'params' | 'query' | 'headers';

interface ValidationOptions {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
}

// Main validation middleware factory
export const validate = (schemas: ValidationOptions) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate each schema if provided
    Object.entries(schemas).forEach(([source, schema]) => {
      if (schema) {
        const { error, value } = schema.validate(req[source as keyof Request], {
          abortEarly: false,
          stripUnknown: true,
        });

        if (error) {
          const sourceErrors = error.details.map(
            (detail: any) => `${source}.${detail.path.join('.')}: ${detail.message}`
          );
          errors.push(...sourceErrors);
        } else {
          // Apply validated values (including defaults) back to request
          (req as any)[source] = value;
        }
      }
    });

    if (errors.length > 0) {
      throw new AppError(`Validation failed: ${errors.join(', ')}`, 400);
    }

    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.string().pattern(/^\d+$/).default('1'),
    limit: Joi.string().pattern(/^\d+$/).default('20'),
    sort: Joi.string().valid('asc', 'desc').default('desc'),
    sortBy: Joi.string().default('createdAt'),
  }),

  // ID parameter
  id: Joi.object({
    id: Joi.string().uuid().required(),
  }),

  // Search query
  search: Joi.object({
    q: Joi.string().min(1).max(100),
    tags: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    company: Joi.string().max(100),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')),
  }),

  // File upload
  file: Joi.object({
    filename: Joi.string().required(),
    mimetype: Joi.string().valid(
      'image/jpeg',
      'image/png', 
      'image/heic',
      'image/webp'
    ).required(),
    size: Joi.number().max(10 * 1024 * 1024).required(), // 10MB
  }),

  // User registration
  userRegistration: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
      .messages({
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
      }),
    name: Joi.string().min(2).max(50).required(),
  }),

  // User login
  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Card creation
  cardCreate: Joi.object({
    name: Joi.string().max(100),
    title: Joi.string().max(100),
    company: Joi.string().max(100),
    email: Joi.string().email(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    website: Joi.string().uri(),
    address: Joi.string().max(500),
    notes: Joi.string().max(1000),
    tags: Joi.array().items(Joi.string().max(50)).max(10),
  }),

  // Card update
  cardUpdate: Joi.object({
    name: Joi.string().max(100),
    title: Joi.string().max(100),
    company: Joi.string().max(100),
    email: Joi.string().email(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    website: Joi.string().uri(),
    address: Joi.string().max(500),
    notes: Joi.string().max(1000),
    tags: Joi.array().items(Joi.string().max(50)).max(10),
  }).min(1), // At least one field required for update
};

// Specific validation middleware functions
export const validatePagination = validate({ query: commonSchemas.pagination });
export const validateId = validate({ params: commonSchemas.id });
export const validateSearch = validate({ query: commonSchemas.search });
export const validateUserRegistration = validate({ body: commonSchemas.userRegistration });
export const validateUserLogin = validate({ body: commonSchemas.userLogin });
export const validateCardCreate = validate({ body: commonSchemas.cardCreate });
export const validateCardUpdate = validate({ body: commonSchemas.cardUpdate });