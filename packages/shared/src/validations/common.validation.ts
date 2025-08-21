// Common validation schemas
import { z } from 'zod';
import { VALIDATION_PATTERNS } from '../constants/validation.constants.js';
import {
  THEMES,
  SORT_ORDERS,
  COMPANY_SIZES,
  CALENDAR_SOURCES,
} from '../constants/app.constants.js';

// Base entity schema
export const baseEntitySchema = z.object({
  id: z.string().regex(VALIDATION_PATTERNS.ID, 'Invalid ID format'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Common field validations
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(254, 'Email must not exceed 254 characters');

export const uuidSchema = z.string().regex(VALIDATION_PATTERNS.UUID, 'Invalid UUID format');

export const cuidSchema = z.string().regex(VALIDATION_PATTERNS.CUID, 'Invalid CUID format');

export const idSchema = z.string().regex(VALIDATION_PATTERNS.ID, 'Invalid ID format');

export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'URL must not exceed 2048 characters');

export const phoneSchema = z
  .string()
  .regex(VALIDATION_PATTERNS.PHONE, 'Invalid phone number format')
  .min(10, 'Phone number must be at least 10 characters')
  .max(15, 'Phone number must not exceed 15 characters');

// Pagination schemas
export const paginationParamsSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 1, 'Page must be a positive number')
    .default(1),
  limit: z
    .union([z.string(), z.number()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .default(20),
  sort: z.enum([SORT_ORDERS.ASC, SORT_ORDERS.DESC]).default(SORT_ORDERS.DESC),
  sortBy: z.string().min(1, 'Sort field is required').default('createdAt'),
});

export const searchParamsSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').max(100).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  company: z.string().max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// User preference schema
export const userPreferencesSchema = z
  .object({
    theme: z.enum([THEMES.LIGHT, THEMES.DARK, THEMES.SYSTEM]).default(THEMES.SYSTEM),
    notifications: z.boolean().default(true),
    emailUpdates: z.boolean().default(true),
    language: z.string().min(2).max(5).default('en'),
    timezone: z.string().default('UTC'),
  })
  .passthrough(); // Allow additional properties

// Company size validation
export const companySizeSchema = z.enum([
  COMPANY_SIZES.MICRO,
  COMPANY_SIZES.SMALL,
  COMPANY_SIZES.MEDIUM,
  COMPANY_SIZES.LARGE,
  COMPANY_SIZES.ENTERPRISE,
  COMPANY_SIZES.MEGA,
]);

// Calendar source validation
export const calendarSourceSchema = z.enum([
  CALENDAR_SOURCES.GOOGLE,
  CALENDAR_SOURCES.OUTLOOK,
  CALENDAR_SOURCES.MANUAL,
]);

// File validation schemas
export const imageFileSchema = z.object({
  size: z.number().max(10 * 1024 * 1024, 'File size must not exceed 10MB'),
  type: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({ message: 'File must be JPEG, PNG, or WebP format' }),
  }),
  name: z.string().min(1, 'File name is required'),
});

// Date range validation
export const dateRangeSchema = z
  .object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })
  .refine(
    data => {
      if (data.dateFrom && data.dateTo) {
        return new Date(data.dateFrom) <= new Date(data.dateTo);
      }
      return true;
    },
    {
      message: 'Start date must be before or equal to end date',
      path: ['dateTo'],
    }
  );

// Array validation helpers
export const createArraySchema = <T>(
  itemSchema: z.ZodSchema<T>,
  minItems = 0,
  maxItems = 100
): z.ZodArray<z.ZodSchema<T>> => {
  return z
    .array(itemSchema)
    .min(minItems, `Must have at least ${minItems} items`)
    .max(maxItems, `Must have at most ${maxItems} items`);
};

export const createOptionalArraySchema = <T>(
  itemSchema: z.ZodSchema<T>,
  maxItems = 100
): z.ZodOptional<z.ZodArray<z.ZodSchema<T>>> => {
  return z.array(itemSchema).max(maxItems, `Must have at most ${maxItems} items`).optional();
};

// String validation helpers
export const createStringSchema = (
  minLength = 1,
  maxLength = 255,
  pattern?: RegExp,
  patternMessage?: string
): z.ZodString => {
  let schema = z
    .string()
    .min(minLength, `Must be at least ${minLength} characters`)
    .max(maxLength, `Must not exceed ${maxLength} characters`);

  if (pattern) {
    schema = schema.regex(pattern, patternMessage || 'Invalid format');
  }

  return schema;
};

// Transform helpers
export const transformToNumber = z
  .union([z.string(), z.number()])
  .transform(val => Number(val))
  .refine(val => !isNaN(val), 'Must be a valid number');

export const transformToBoolean = z.union([z.string(), z.boolean()]).transform(val => {
  if (typeof val === 'boolean') return val;
  return val === 'true' || val === '1';
});

export const transformToDate = z
  .union([z.string(), z.date()])
  .transform(val => {
    if (val instanceof Date) return val;
    return new Date(val);
  })
  .refine(val => !isNaN(val.getTime()), 'Invalid date');

// Export types
export type PaginationParams = z.infer<typeof paginationParamsSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type CompanySize = z.infer<typeof companySizeSchema>;
export type CalendarSource = z.infer<typeof calendarSourceSchema>;
export type ImageFile = z.infer<typeof imageFileSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
