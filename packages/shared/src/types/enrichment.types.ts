/**
 * Company Enrichment Types
 * 
 * Types for multi-source company data enrichment system
 */

// Enrichment source types
export type EnrichmentSource = 'clearbit' | 'linkedin' | 'crunchbase' | 'manual' | 'opencorporates' | 'perplexity';

export type EnrichmentStatus = 'pending' | 'enriched' | 'failed' | 'partial' | 'skipped';

export type EnrichmentType = 'company' | 'person' | 'social' | 'news' | 'logo';

// Person enrichment data structure
export interface PersonEnrichmentData {
  // Basic info
  name?: string;
  title?: string;
  currentRole?: string;
  
  // Professional background
  education?: Array<{
    institution: string;
    degree?: string;
    field?: string;
    year?: number;
  }>;
  experience?: Array<{
    company: string;
    role: string;
    duration?: string;
    description?: string;
  }>;
  
  // Expertise and skills
  expertise?: string[];
  skills?: string[];
  certifications?: string[];
  
  // Achievements and recognition
  achievements?: string[];
  publications?: Array<{
    title: string;
    url?: string;
    publishDate?: string;
    venue?: string;
  }>;
  speakingEngagements?: Array<{
    event: string;
    topic?: string;
    date?: string;
    url?: string;
  }>;
  awards?: Array<{
    title: string;
    organization?: string;
    year?: number;
  }>;
  
  // Professional activities
  boardMemberships?: string[];
  advisoryRoles?: string[];
  professionalMemberships?: string[];
  
  // Social media and online presence
  linkedinUrl?: string;
  twitterHandle?: string;
  personalWebsite?: string;
  blogUrl?: string;
  githubUrl?: string;
  
  // AI Research data (from Perplexity)
  recentActivities?: Array<{
    title: string;
    description: string;
    date?: string;
    url?: string;
    source: string;
  }>;
  industryInfluence?: string;
  thoughtLeadership?: string[];
  
  // Metadata
  confidence?: number;
  lastUpdated?: Date;
}

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
  
  // AI Research data (from Perplexity)
  recentNews?: Array<{
    title: string;
    url: string;
    summary: string;
    publishDate?: string;
    source: string;
  }>;
  keyPeople?: Array<{
    name: string;
    role: string;
    description?: string;
  }>;
  competitors?: string[];
  marketPosition?: string;
  businessModel?: string;
  recentDevelopments?: string[];
  
  // Citation and research metadata
  citations?: Array<{
    url: string;
    title: string;
    source: string;
    accessDate: string;
    relevance: number;
  }>;
  researchQuery?: string;
  researchDate?: Date;
  
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

// Unified business card enrichment data structure
export interface BusinessCardEnrichmentData {
  personData?: PersonEnrichmentData;
  companyData?: CompanyEnrichmentData;
  
  // Combined research metadata
  citations?: Array<{
    url: string;
    title: string;
    source: string;
    accessDate: string;
    relevance: number;
    category: 'person' | 'company' | 'both';
  }>;
  researchQuery?: string;
  researchDate?: Date;
  
  // Confidence scores
  personConfidence?: number;
  companyConfidence?: number;
  overallConfidence?: number;
  lastUpdated?: Date;
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

// Unified business card enrichment request/response
export interface EnrichBusinessCardRequest {
  // Card reference (optional for standalone enrichment)
  cardId?: string;
  
  // Person information
  personName?: string;
  personTitle?: string;
  
  // Company information  
  companyName?: string;
  domain?: string;
  website?: string;
  
  // Enrichment options
  sources?: EnrichmentSource[];
  forceRefresh?: boolean;
  includePersonData?: boolean;
  includeCompanyData?: boolean;
}

export interface EnrichBusinessCardResponse {
  success: boolean;
  cardId?: string;
  enrichmentData: BusinessCardEnrichmentData;
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

// Perplexity API response types
// Enhanced Perplexity response for combined person + company research
export interface PerplexityBusinessCardResponse {
  // Person research data
  person?: {
    name: string;
    title?: string;
    currentRole?: string;
    education?: Array<{
      institution: string;
      degree?: string;
      field?: string;
      year?: number;
    }>;
    experience?: Array<{
      company: string;
      role: string;
      duration?: string;
      description?: string;
    }>;
    expertise?: string[];
    achievements?: string[];
    publications?: Array<{
      title: string;
      url?: string;
      publishDate?: string;
      venue?: string;
    }>;
    speakingEngagements?: Array<{
      event: string;
      topic?: string;
      date?: string;
      url?: string;
    }>;
    awards?: Array<{
      title: string;
      organization?: string;
      year?: number;
    }>;
    recentActivities?: Array<{
      title: string;
      description: string;
      date?: string;
      url?: string;
      source: string;
    }>;
    socialMedia?: {
      linkedinUrl?: string;
      twitterHandle?: string;
      personalWebsite?: string;
      blogUrl?: string;
      githubUrl?: string;
    };
  };
  
  // Company research data
  company?: {
    name: string;
    description?: string;
    industry?: string;
    website?: string;
    headquarters?: string;
    employeeCount?: number;
    founded?: number;
    annualRevenue?: string;
    businessModel?: string;
    marketPosition?: string;
  };
  recentNews?: Array<{
    title: string;
    summary: string;
    url: string;
    publishDate?: string;
    source: string;
  }>;
  keyPeople?: Array<{
    name: string;
    role: string;
    description?: string;
  }>;
  competitors?: string[];
  recentDevelopments?: string[];
  technologies?: string[];
  socialMedia?: {
    linkedinUrl?: string;
    twitterHandle?: string;
    facebookUrl?: string;
  };
  
  // Combined research metadata
  citations: Array<{
    url: string;
    title: string;
    source: string;
    relevance: number;
    category: 'person' | 'company' | 'both';
  }>;
  researchMetadata: {
    query: string;
    personConfidence: number;
    companyConfidence: number;
    overallConfidence: number;
    processingTimeMs: number;
    researchDate: string;
  };
}

// Legacy alias for backward compatibility
export interface PerplexityCompanyResponse extends Omit<PerplexityBusinessCardResponse, 'person'> {}

// Enhanced Perplexity structured output schema for combined person + company research
export interface PerplexityBusinessCardSchema {
  type: 'object';
  properties: {
    person: {
      type: 'object';
      properties: {
        name: { type: 'string' };
        title: { type: 'string' };
        currentRole: { type: 'string' };
        education: {
          type: 'array';
          items: {
            type: 'object';
            properties: {
              institution: { type: 'string' };
              degree: { type: 'string' };
              field: { type: 'string' };
              year: { type: 'number' };
            };
            required: ['institution'];
          };
        };
        experience: {
          type: 'array';
          items: {
            type: 'object';
            properties: {
              company: { type: 'string' };
              role: { type: 'string' };
              duration: { type: 'string' };
              description: { type: 'string' };
            };
            required: ['company', 'role'];
          };
        };
        expertise: {
          type: 'array';
          items: { type: 'string' };
        };
        achievements: {
          type: 'array';
          items: { type: 'string' };
        };
        publications: {
          type: 'array';
          items: {
            type: 'object';
            properties: {
              title: { type: 'string' };
              url: { type: 'string' };
              publishDate: { type: 'string' };
              venue: { type: 'string' };
            };
            required: ['title'];
          };
        };
        recentActivities: {
          type: 'array';
          items: {
            type: 'object';
            properties: {
              title: { type: 'string' };
              description: { type: 'string' };
              date: { type: 'string' };
              url: { type: 'string' };
              source: { type: 'string' };
            };
            required: ['title', 'description', 'source'];
          };
        };
        socialMedia: {
          type: 'object';
          properties: {
            linkedinUrl: { type: 'string' };
            twitterHandle: { type: 'string' };
            personalWebsite: { type: 'string' };
            blogUrl: { type: 'string' };
            githubUrl: { type: 'string' };
          };
        };
      };
      required: ['name'];
    };
    company: {
      type: 'object';
      properties: {
        name: { type: 'string' };
        description: { type: 'string' };
        industry: { type: 'string' };
        website: { type: 'string' };
        headquarters: { type: 'string' };
        employeeCount: { type: 'number' };
        founded: { type: 'number' };
        annualRevenue: { type: 'string' };
        businessModel: { type: 'string' };
        marketPosition: { type: 'string' };
      };
      required: ['name'];
    };
    recentNews: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          title: { type: 'string' };
          summary: { type: 'string' };
          url: { type: 'string' };
          publishDate: { type: 'string' };
          source: { type: 'string' };
        };
        required: ['title', 'summary', 'source'];
      };
    };
    keyPeople: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          name: { type: 'string' };
          role: { type: 'string' };
          description: { type: 'string' };
        };
        required: ['name', 'role'];
      };
    };
    competitors: {
      type: 'array';
      items: { type: 'string' };
    };
    recentDevelopments: {
      type: 'array';
      items: { type: 'string' };
    };
    technologies: {
      type: 'array';
      items: { type: 'string' };
    };
    socialMedia: {
      type: 'object';
      properties: {
        linkedinUrl: { type: 'string' };
        twitterHandle: { type: 'string' };
        facebookUrl: { type: 'string' };
      };
    };
    citations: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          url: { type: 'string' };
          title: { type: 'string' };
          source: { type: 'string' };
          relevance: { type: 'number' };
          category: { type: 'string', enum: ['person', 'company', 'both'] };
        };
        required: ['url', 'title', 'source', 'relevance', 'category'];
      };
    };
    researchMetadata: {
      type: 'object';
      properties: {
        query: { type: 'string' };
        personConfidence: { type: 'number' };
        companyConfidence: { type: 'number' };
        overallConfidence: { type: 'number' };
        processingTimeMs: { type: 'number' };
        researchDate: { type: 'string' };
      };
      required: ['query', 'personConfidence', 'companyConfidence', 'overallConfidence', 'researchDate'];
    };
  };
  required: ['citations', 'researchMetadata'];
}

// Export all types for named imports