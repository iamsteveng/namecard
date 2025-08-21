import { schemas } from '@namecard/shared';
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

import { AppError } from './error.middleware.js';

// type ValidationSource = 'body' | 'params' | 'query' | 'headers';

interface ValidationOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
  headers?: ZodSchema;
}

// Main validation middleware factory
export const validate = (schemas: ValidationOptions) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate each schema if provided
    Object.entries(schemas).forEach(([source, schema]) => {
      if (schema) {
        const result = schema.safeParse(req[source as keyof Request] || {});

        if (!result.success) {
          const sourceErrors = result.error.errors.map(
            (error: any) => `${source}.${error.path.join('.')}: ${error.message}`
          );
          errors.push(...sourceErrors);
        } else {
          // Apply validated values (including defaults) back to request
          (req as any)[source] = result.data;
        }
      }
    });

    if (errors.length > 0) {
      throw new AppError(`Validation failed: ${errors.join(', ')}`, 400);
    }

    next();
  };
};

// Using shared validation schemas from @namecard/shared
const {
  paginationParamsSchema,
  searchParamsSchema,
  getCardParamsSchema,
  updateCardSchema,
  createCardSchema,
  listCardsParamsSchema,
  userRegistrationSchema,
  userLoginSchema,
} = schemas;

// Specific validation middleware functions
export const validatePagination = validate({ query: paginationParamsSchema });
export const validateId = validate({ params: getCardParamsSchema });
export const validateSearch = validate({ query: searchParamsSchema });

// Combined pagination and search validation
export const validatePaginationAndSearch = validate({
  query: listCardsParamsSchema,
});
export const validateUserRegistration = validate({ body: userRegistrationSchema });
export const validateUserLogin = validate({ body: userLoginSchema });
export const validateCardCreate = validate({ body: createCardSchema });
export const validateCardUpdate = validate({ body: updateCardSchema });

// Generic validation function for request body
export const validateRequest = (schema: ZodSchema) => {
  return validate({ body: schema });
};
