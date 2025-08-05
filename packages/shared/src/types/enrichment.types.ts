/**
 * Company Enrichment Types
 * 
 * Types for multi-source company data enrichment system
 */

// Enrichment source types
export type EnrichmentSource = 'clearbit' | 'linkedin' | 'crunchbase' | 'manual' | 'opencorporates';

export type EnrichmentStatus = 'pending' | 'enriched' | 'failed' | 'partial' | 'skipped';

export type EnrichmentType = 'company' | 'person' | 'social' | 'news' | 'logo';

// Company enrichment data structure
export interface CompanyEnrichmentData {
  // Basic info
  name?: string;
  domain?: string;
  website?: string;
  description?: string;
  industry?: string;
  
  // Location and size
  headquarters?: string;
  location?: string;
  size?: string;
  employeeCount?: number;
  
  // Financial info
  founded?: number;
  annualRevenue?: string;
  funding?: string;
  
  // Technology and keywords
  technologies?: string[];
  keywords?: string[];
  
  // Social media
  linkedinUrl?: string;
  twitterHandle?: string;
  facebookUrl?: string;
  
  // Visual assets
  logoUrl?: string;
  
  // Metadata
  confidence?: number;
  lastUpdated?: Date;
}

// Enrichment source configuration
export interface EnrichmentSourceConfig {
  source: EnrichmentSource;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

// Enrichment request and response types
export interface EnrichCompanyRequest {
  companyName?: string;
  domain?: string;
  website?: string;
  sources?: EnrichmentSource[];
  forceRefresh?: boolean;
}

export interface EnrichCompanyResponse {
  success: boolean;
  companyId: string;
  enrichmentData: CompanyEnrichmentData;
  sources: {
    [source in EnrichmentSource]?: {
      status: EnrichmentStatus;
      confidence: number;
      dataPoints: number;
      error?: string;
    };
  };
  overallConfidence: number;
  processingTimeMs: number;
}

// Card enrichment types (use EnrichCardRequest/Response from card.types.ts for basic card enrichment)
export interface DetailedEnrichCardRequest {
  cardId: string;
  enrichmentTypes?: EnrichmentType[];
  sources?: EnrichmentSource[];
  triggeredBy?: 'auto' | 'manual' | 'batch';
}

export interface DetailedEnrichCardResponse {
  success: boolean;
  cardId: string;
  enrichments: Array<{
    type: EnrichmentType;
    status: EnrichmentStatus;
    companiesFound: number;
    dataPointsAdded: number;
    confidence: number;
    error?: string;
  }>;
  overallConfidence: number;
  processingTimeMs: number;
}

// Batch enrichment types
export interface BatchEnrichmentRequest {
  cardIds: string[];
  enrichmentTypes?: EnrichmentType[];
  sources?: EnrichmentSource[];
  maxConcurrent?: number;
}

export interface BatchEnrichmentResponse {
  success: boolean;
  totalCards: number;
  processedCards: number;
  failedCards: number;
  results: DetailedEnrichCardResponse[];
  overallProcessingTimeMs: number;
}

// Enrichment queue and job types
export interface EnrichmentJob {
  id: string;
  type: 'card' | 'company' | 'batch';
  targetId: string; // cardId or companyId
  priority: 'low' | 'normal' | 'high';
  sources: EnrichmentSource[];
  createdAt: Date;
  scheduledAt?: Date;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
}

export interface EnrichmentQueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTimeMs: number;
  estimatedWaitTimeMs: number;
}

// External API response types
export interface ClearbitCompanyResponse {
  id: string;
  name: string;
  legalName?: string;
  domain: string;
  domainAliases?: string[];
  site?: {
    url: string;
    title?: string;
    h1?: string;
    metaDescription?: string;
  };
  category?: {
    sector: string;
    industryGroup: string;
    industry: string;
    subIndustry: string;
  };
  tags?: string[];
  description?: string;
  foundedYear?: number;
  location?: string;
  timeZone?: string;
  utcOffset?: number;
  geo?: {
    streetNumber?: string;
    streetName?: string;
    subPremise?: string;
    city: string;
    postalCode?: string;
    state: string;
    stateCode: string;
    country: string;
    countryCode: string;
    lat?: number;
    lng?: number;
  };
  logo?: string;
  facebook?: {
    handle: string;
    likes?: number;
  };
  linkedin?: {
    handle: string;
    followers?: number;
  };
  twitter?: {
    handle: string;
    id?: string;
    bio?: string;
    followers?: number;
    following?: number;
    location?: string;
    site?: string;
    avatar?: string;
  };
  crunchbase?: {
    handle: string;
  };
  emailProvider?: boolean;
  type?: 'private' | 'public' | 'nonprofit' | 'government';
  ticker?: string;
  identifiers?: {
    usEIN?: string;
    usCIK?: string;
  };
  phone?: string;
  metrics?: {
    alexaUsRank?: number;
    alexaGlobalRank?: number;
    employees?: number;
    employeesRange?: string;
    marketCap?: number;
    raised?: number;
    annualRevenue?: number;
    estimatedAnnualRevenue?: string;
    fiscalYearEnd?: number;
  };
  indexedAt?: string;
  tech?: string[];
  techCategories?: string[];
  parent?: {
    domain: string;
  };
  ultimateParent?: {
    domain: string;
  };
}

// LinkedIn API types (when available)
export interface LinkedInCompanyResponse {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  headquarters?: {
    city: string;
    country: string;
    geographicArea?: string;
    line1?: string;
    line2?: string;
    postalCode?: string;
  };
  foundedOn?: {
    year: number;
    month?: number;
  };
  specialties?: string[];
  logo?: string;
  coverPhoto?: string;
  followerCount?: number;
  employeeCountRange?: {
    start: number;
    end: number;
  };
}

// Error types
export interface EnrichmentError {
  code: string;
  message: string;
  source?: EnrichmentSource;
  details?: any;
  retryable: boolean;
}

export interface EnrichmentRateLimitInfo {
  requestsRemaining: number;
  resetTime: Date;
  retryAfterMs?: number;
}

// Configuration and settings
export interface EnrichmentSettings {
  enabledSources: EnrichmentSource[];
  autoEnrichNewCards: boolean;
  batchSize: number;
  maxConcurrentJobs: number;
  retryFailedJobsAfterMs: number;
  cleanupCompletedJobsAfterMs: number;
  defaultConfidenceThreshold: number;
  sourcePreferences: {
    [source in EnrichmentSource]?: {
      weight: number; // 0-1, for merging conflicting data
      trustLevel: number; // 0-100
    };
  };
}

// Analytics and metrics
export interface EnrichmentMetrics {
  totalEnrichments: number;
  successRate: number;
  averageProcessingTime: number;
  sourceBreakdown: {
    [source in EnrichmentSource]?: {
      requests: number;
      successes: number;
      failures: number;
      avgConfidence: number;
    };
  };
  dataQualityMetrics: {
    completenessScore: number; // % of fields populated
    accuracyScore: number; // Based on confidence scores
    freshnessScore: number; // Based on last update times
  };
}

// Export all types for named imports