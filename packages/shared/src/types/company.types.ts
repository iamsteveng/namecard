// Company-related types
import type { BaseEntity, CompanySize } from './common.types.js';
import type { CardCompany, NewsArticle } from './card.types.js';

// Core Company interface matching Prisma schema
export interface Company extends BaseEntity {
  name: string;
  industry?: string;
  size?: CompanySize;
  headquarters?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  lastUpdated: Date;

  // Relations (populated when included)
  cards?: CardCompany[];
  newsArticles?: NewsArticle[];
}

// Company creation/update types
export interface CreateCompanyData {
  name: string;
  industry?: string;
  size?: CompanySize;
  headquarters?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateCompanyData {
  name?: string;
  industry?: string;
  size?: CompanySize;
  headquarters?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
}

// Company enrichment types
export interface BasicCompanyEnrichmentData {
  industry?: string;
  size?: CompanySize;
  headquarters?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  fundingRounds?: FundingRound[];
  executives?: Executive[];
  competitors?: string[];
  socialMedia?: SocialMediaLinks;
  financials?: CompanyFinancials;
}

export interface FundingRound {
  id: string;
  round: string;
  amount?: number;
  currency?: string;
  date?: Date;
  investors?: string[];
  source?: string;
}

export interface Executive {
  name: string;
  title: string;
  linkedInUrl?: string;
  bio?: string;
}

export interface SocialMediaLinks {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
}

export interface CompanyFinancials {
  revenue?: number;
  employees?: number;
  founded?: number;
  valuation?: number;
  currency?: string;
  fiscalYear?: number;
}

// Company search and filtering
export interface CompanyFilters {
  industry?: string;
  size?: CompanySize;
  location?: string;
  hasNews?: boolean;
  hasCards?: boolean;
}

export interface CompanySearchParams extends CompanyFilters {
  q?: string;
}

// Company news and insights
export interface CompanyInsights {
  companyId: string;
  recentNews: NewsArticle[];
  sentiment: 'positive' | 'neutral' | 'negative';
  keyTopics: string[];
  lastUpdated: Date;
}

export interface CompanyNewsFilter {
  companyId: string;
  dateFrom?: Date;
  dateTo?: Date;
  sources?: string[];
  limit?: number;
}

// Company integration types
export interface CompanyDataSource {
  name: string;
  type: 'crunchbase' | 'clearbit' | 'linkedin' | 'manual';
  confidence: number;
  lastSync?: Date;
  data: Record<string, any>;
}

export interface CompanySyncRequest {
  companyId: string;
  sources?: string[];
  forceUpdate?: boolean;
}

export interface CompanySyncResponse {
  companyId: string;
  updated: boolean;
  changes: string[];
  nextSyncAt?: Date;
}
