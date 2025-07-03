// Card validation schemas
import { z } from 'zod';
import { VALIDATION_LIMITS, VALIDATION_PATTERNS } from '../constants/validation.constants.js';

export const cardSchema = z.object({
  name: z.string().min(1).max(VALIDATION_LIMITS.NAME.MAX_LENGTH).optional(),
  title: z.string().max(VALIDATION_LIMITS.NAME.MAX_LENGTH).optional(),
  company: z.string().min(1).max(VALIDATION_LIMITS.COMPANY.MAX_LENGTH).optional(),
  email: z.string().email().max(VALIDATION_LIMITS.EMAIL.MAX_LENGTH).optional(),
  phone: z.string().regex(VALIDATION_PATTERNS.PHONE).optional(),
  address: z.string().max(500).optional(),
  website: z.string().url().optional(),
  notes: z.string().max(VALIDATION_LIMITS.NOTES.MAX_LENGTH).optional(),
  tags: z
    .array(z.string().max(VALIDATION_LIMITS.TAGS.MAX_LENGTH))
    .max(VALIDATION_LIMITS.TAGS.MAX_COUNT)
    .optional(),
});

export const scanCardSchema = z.object({
  file: z.object({
    size: z.number().max(VALIDATION_LIMITS.FILE.MAX_SIZE),
    type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  }),
});

export const searchCardSchema = z.object({
  query: z.string().min(1).max(100).optional(),
  company: z.string().max(VALIDATION_LIMITS.COMPANY.MAX_LENGTH).optional(),
  tags: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type CardInput = z.infer<typeof cardSchema>;
export type ScanCardInput = z.infer<typeof scanCardSchema>;
export type SearchCardInput = z.infer<typeof searchCardSchema>;
