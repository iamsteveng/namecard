// Company validation schemas
import { z } from 'zod';
import {
  baseEntitySchema,
  uuidSchema,
  urlSchema,
  companySizeSchema,
  paginationParamsSchema,
  createStringSchema,
  createArraySchema,
} from './common.validation.js';
import { INDUSTRIES } from '../constants/app.constants.js';

// Core company schema
export const companySchema = baseEntitySchema.extend({
  name: createStringSchema(1, 200),
  industry: z.enum([...INDUSTRIES] as [string, ...string[]]).optional(),
  size: companySizeSchema.optional(),
  headquarters: createStringSchema(1, 200).optional(),
  website: urlSchema.optional(),
  description: createStringSchema(0, 1000).optional(),
  logoUrl: urlSchema.optional(),
  lastUpdated: z.date(),
});

// Company creation schema
export const createCompanySchema = z.object({
  name: createStringSchema(1, 200),
  industry: z.enum([...INDUSTRIES] as [string, ...string[]]).optional(),
  size: companySizeSchema.optional(),
  headquarters: createStringSchema(1, 200).optional(),
  website: urlSchema.optional(),
  description: createStringSchema(0, 1000).optional(),
  logoUrl: urlSchema.optional(),
});

// Company update schema
export const updateCompanySchema = z
  .object({
    name: createStringSchema(1, 200).optional(),
    industry: z.enum([...INDUSTRIES] as [string, ...string[]]).optional(),
    size: companySizeSchema.optional(),
    headquarters: createStringSchema(1, 200).optional(),
    website: urlSchema.optional(),
    description: createStringSchema(0, 1000).optional(),
    logoUrl: urlSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// Company filtering schemas
export const companyFiltersSchema = z.object({
  industry: z.enum([...INDUSTRIES] as [string, ...string[]]).optional(),
  size: companySizeSchema.optional(),
  location: createStringSchema(1, 200).optional(),
  hasNews: z.boolean().optional(),
  hasCards: z.boolean().optional(),
});

export const companySearchParamsSchema = z
  .object({
    q: z.string().min(2, 'Search query must be at least 2 characters').max(100).optional(),
  })
  .merge(companyFiltersSchema);

export const listCompaniesParamsSchema = paginationParamsSchema.merge(companySearchParamsSchema);

// Company enrichment schemas
export const companyEnrichmentDataSchema = z.object({
  industry: z.enum([...INDUSTRIES] as [string, ...string[]]).optional(),
  size: companySizeSchema.optional(),
  headquarters: createStringSchema(1, 200).optional(),
  website: urlSchema.optional(),
  description: createStringSchema(0, 1000).optional(),
  logoUrl: urlSchema.optional(),
  fundingRounds: createArraySchema(
    z.object({
      id: uuidSchema,
      round: z.string(),
      amount: z.number().min(0).optional(),
      currency: z.string().length(3).optional(),
      date: z.date().optional(),
      investors: createArraySchema(z.string()).optional(),
      source: z.string().optional(),
    }),
    0,
    50
  ).optional(),
  executives: createArraySchema(
    z.object({
      name: createStringSchema(1, 100),
      title: createStringSchema(1, 100),
      linkedInUrl: urlSchema.optional(),
      bio: createStringSchema(0, 500).optional(),
    }),
    0,
    20
  ).optional(),
  competitors: createArraySchema(createStringSchema(1, 200), 0, 50).optional(),
  socialMedia: z
    .object({
      linkedin: urlSchema.optional(),
      twitter: urlSchema.optional(),
      facebook: urlSchema.optional(),
      instagram: urlSchema.optional(),
      youtube: urlSchema.optional(),
    })
    .optional(),
  financials: z
    .object({
      revenue: z.number().min(0).optional(),
      employees: z.number().min(1).optional(),
      founded: z.number().min(1800).max(new Date().getFullYear()).optional(),
      valuation: z.number().min(0).optional(),
      currency: z.string().length(3).default('USD'),
      fiscalYear: z.number().min(2000).max(new Date().getFullYear()).optional(),
    })
    .optional(),
});

// Company insights schema
export const companyInsightsSchema = z.object({
  companyId: uuidSchema,
  recentNews: createArraySchema(
    z.object({
      id: uuidSchema,
      companyId: uuidSchema,
      title: createStringSchema(1, 500),
      summary: createStringSchema(0, 2000).optional(),
      url: urlSchema.optional(),
      publishedDate: z.date().optional(),
      source: z.string().optional(),
      createdAt: z.date(),
    }),
    0,
    20
  ),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  keyTopics: createArraySchema(createStringSchema(1, 100), 0, 20),
  lastUpdated: z.date(),
});

// Company news filter schema
export const companyNewsFilterSchema = z.object({
  companyId: uuidSchema,
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  sources: createArraySchema(z.string(), 0, 20).optional(),
  limit: z.number().min(1).max(100).default(20),
});

// Company data source schema
export const companyDataSourceSchema = z.object({
  name: z.string(),
  type: z.enum(['crunchbase', 'clearbit', 'linkedin', 'manual']),
  confidence: z.number().min(0).max(1),
  lastSync: z.date().optional(),
  data: z.record(z.any()),
});

// Company sync schemas
export const companySyncRequestSchema = z.object({
  companyId: uuidSchema,
  sources: createArraySchema(z.string(), 0, 10).optional(),
  forceUpdate: z.boolean().default(false),
});

export const companySyncResponseSchema = z.object({
  companyId: uuidSchema,
  updated: z.boolean(),
  changes: createArraySchema(z.string()),
  nextSyncAt: z.date().optional(),
});

// API parameter schemas
export const getCompanyParamsSchema = z.object({
  id: uuidSchema,
});

export const getCompanyCardsParamsSchema = z.object({
  id: uuidSchema,
});

export const getCompanyInsightsParamsSchema = z.object({
  id: uuidSchema,
});

// Query parameter schemas
export const getCompaniesQuerySchema = listCompaniesParamsSchema;

export const getCompanyCardsQuerySchema = paginationParamsSchema;

// Validation functions
export const validateCompanyName = (name: string): boolean => {
  return createStringSchema(1, 200).safeParse(name).success;
};

export const validateCompanyIndustry = (industry: string): boolean => {
  return z.enum([...INDUSTRIES] as [string, ...string[]]).safeParse(industry).success;
};

export const validateCompanyWebsite = (website: string): boolean => {
  return urlSchema.safeParse(website).success;
};

export const validateCompanySize = (size: string): boolean => {
  return companySizeSchema.safeParse(size).success;
};

// Export inferred types
export type Company = z.infer<typeof companySchema>;
export type CreateCompany = z.infer<typeof createCompanySchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;
export type CompanyFilters = z.infer<typeof companyFiltersSchema>;
export type CompanySearchParams = z.infer<typeof companySearchParamsSchema>;
export type ListCompaniesParams = z.infer<typeof listCompaniesParamsSchema>;
export type CompanyEnrichmentData = z.infer<typeof companyEnrichmentDataSchema>;
export type CompanyInsights = z.infer<typeof companyInsightsSchema>;
export type CompanyNewsFilter = z.infer<typeof companyNewsFilterSchema>;
export type CompanyDataSource = z.infer<typeof companyDataSourceSchema>;
export type CompanySyncRequest = z.infer<typeof companySyncRequestSchema>;
export type CompanySyncResponse = z.infer<typeof companySyncResponseSchema>;
export type GetCompanyParams = z.infer<typeof getCompanyParamsSchema>;
export type GetCompanyCardsParams = z.infer<typeof getCompanyCardsParamsSchema>;
export type GetCompanyInsightsParams = z.infer<typeof getCompanyInsightsParamsSchema>;
export type GetCompaniesQuery = z.infer<typeof getCompaniesQuerySchema>;
export type GetCompanyCardsQuery = z.infer<typeof getCompanyCardsQuerySchema>;
