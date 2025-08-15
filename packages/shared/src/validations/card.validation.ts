// Card validation schemas
import { z } from 'zod';
import {
  baseEntitySchema,
  idSchema,
  emailSchema,
  phoneSchema,
  urlSchema,
  paginationParamsSchema,
  searchParamsSchema,
  imageFileSchema,
  createArraySchema,
  createStringSchema,
} from './common.validation.js';
import { EXPORT_FORMATS, IMPORT_FORMATS, ENRICHMENT_TYPES } from '../constants/app.constants.js';

// Core card schema
export const cardSchema = baseEntitySchema.extend({
  userId: idSchema,
  originalImageUrl: urlSchema,
  processedImageUrl: urlSchema.optional(),
  extractedText: z.string().max(5000).optional(),
  confidence: z.number().min(0).max(1).optional(),

  // Extracted information
  name: createStringSchema(1, 100).optional(),
  title: createStringSchema(1, 100).optional(),
  company: createStringSchema(1, 200).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: createStringSchema(1, 500).optional(),
  website: urlSchema.optional(),

  // Metadata
  notes: createStringSchema(0, 2000).optional(),
  tags: createArraySchema(createStringSchema(1, 50), 0, 20).default([]),
  scanDate: z.date().optional(),
  lastEnrichmentDate: z.date().optional(),
});

// Card creation schema
export const createCardSchema = z.object({
  userId: idSchema,
  originalImageUrl: urlSchema,
  extractedText: z.string().max(5000).optional(),
  confidence: z.number().min(0).max(1).optional(),

  // Extracted information
  name: createStringSchema(1, 100).optional(),
  title: createStringSchema(1, 100).optional(),
  company: createStringSchema(1, 200).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: createStringSchema(1, 500).optional(),
  website: urlSchema.optional(),

  // Metadata
  notes: createStringSchema(0, 2000).optional(),
  tags: createArraySchema(createStringSchema(1, 50), 0, 20).default([]),
  scanDate: z.date().optional(),
});

// Card update schema (all fields optional except validation)
export const updateCardSchema = z
  .object({
    name: createStringSchema(1, 100).optional(),
    title: createStringSchema(1, 100).optional(),
    company: createStringSchema(1, 200).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    address: createStringSchema(1, 500).optional(),
    website: urlSchema.optional(),
    notes: createStringSchema(0, 2000).optional(),
    tags: createArraySchema(createStringSchema(1, 50), 0, 20).optional(),
    processedImageUrl: urlSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// Card scanning schema
export const scanCardSchema = z.object({
  imageFile: imageFileSchema,
  userId: idSchema,
});

// Card enrichment schema
export const enrichCardSchema = z.object({
  cardId: idSchema,
  enrichmentType: z
    .enum([
      ENRICHMENT_TYPES.COMPANY,
      ENRICHMENT_TYPES.NEWS,
      ENRICHMENT_TYPES.CALENDAR,
      ENRICHMENT_TYPES.ALL,
    ])
    .default(ENRICHMENT_TYPES.ALL),
});

// Card search and filtering schemas
export const cardFiltersSchema = z
  .object({
    company: createStringSchema(1, 200).optional(),
    tags: z.union([z.string(), createArraySchema(z.string())]).optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    hasCompany: z.boolean().optional(),
  })
  .extend({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  });

export const cardSearchParamsSchema = searchParamsSchema.merge(cardFiltersSchema).extend({
  userId: idSchema.optional(),
});

export const listCardsParamsSchema = paginationParamsSchema
  .merge(searchParamsSchema)
  .merge(cardFiltersSchema);

// Card export schema
export const cardExportSchema = z.object({
  cardIds: createArraySchema(idSchema, 0, 1000).optional(),
  format: z.enum([EXPORT_FORMATS.JSON, EXPORT_FORMATS.CSV, EXPORT_FORMATS.VCARD]),
  includeImages: z.boolean().default(false),
});

// Card import schema
export const cardImportSchema = z.object({
  file: z.object({
    size: z.number().max(50 * 1024 * 1024, 'Import file must not exceed 50MB'),
    type: z.enum(['application/json', 'text/csv', 'application/csv'], {
      errorMap: () => ({ message: 'File must be JSON or CSV format' }),
    }),
    name: z.string().min(1, 'File name is required'),
  }),
  format: z.enum([IMPORT_FORMATS.JSON, IMPORT_FORMATS.CSV]),
  userId: idSchema,
});

// API request schemas
export const getCardParamsSchema = z.object({
  id: idSchema,
});

export const updateCardParamsSchema = z.object({
  id: idSchema,
});

export const deleteCardParamsSchema = z.object({
  id: idSchema,
});

export const enrichCardParamsSchema = z.object({
  id: idSchema,
});

// Query parameter schemas for endpoints
export const getCardsQuerySchema = listCardsParamsSchema;

export const searchCardsQuerySchema = z
  .object({
    q: z.string().min(2, 'Search query must be at least 2 characters').max(100),
  })
  .merge(paginationParamsSchema)
  .merge(cardFiltersSchema);

// Validation for specific card fields
export const validateCardName = (name: string): boolean => {
  return createStringSchema(1, 100).safeParse(name).success;
};

export const validateCardEmail = (email: string): boolean => {
  return emailSchema.safeParse(email).success;
};

export const validateCardPhone = (phone: string): boolean => {
  return phoneSchema.safeParse(phone).success;
};

export const validateCardTags = (tags: string[]): boolean => {
  return createArraySchema(createStringSchema(1, 50), 0, 20).safeParse(tags).success;
};

// Export inferred types
export type Card = z.infer<typeof cardSchema>;
export type CreateCard = z.infer<typeof createCardSchema>;
export type UpdateCard = z.infer<typeof updateCardSchema>;
export type ScanCard = z.infer<typeof scanCardSchema>;
export type EnrichCard = z.infer<typeof enrichCardSchema>;
export type CardFilters = z.infer<typeof cardFiltersSchema>;
export type CardSearchParams = z.infer<typeof cardSearchParamsSchema>;
export type ListCardsParams = z.infer<typeof listCardsParamsSchema>;
export type CardExport = z.infer<typeof cardExportSchema>;
export type CardImport = z.infer<typeof cardImportSchema>;
export type GetCardParams = z.infer<typeof getCardParamsSchema>;
export type UpdateCardParams = z.infer<typeof updateCardParamsSchema>;
export type DeleteCardParams = z.infer<typeof deleteCardParamsSchema>;
export type EnrichCardParams = z.infer<typeof enrichCardParamsSchema>;
export type GetCardsQuery = z.infer<typeof getCardsQuerySchema>;
export type SearchCardsQuery = z.infer<typeof searchCardsQuerySchema>;
