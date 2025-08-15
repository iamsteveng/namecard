/**
 * Clearbit Enrichment Service
 *
 * Implements company data enrichment using Clearbit API
 */

import {
  EnrichCompanyRequest,
  CompanyEnrichmentData,
  ClearbitCompanyResponse,
  EnrichmentSourceConfig,
} from '@namecard/shared/types/enrichment.types';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

import { BaseEnrichmentService } from './base-enrichment.service';

export class ClearbitEnrichmentService extends BaseEnrichmentService {
  private client: AxiosInstance;

  constructor(prisma: PrismaClient, config: EnrichmentSourceConfig) {
    super(prisma, 'clearbit', config);

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://company-stream.clearbit.com/v2',
      timeout: config.timeout || 10000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for rate limiting
    this.setupRateLimiting();
  }

  protected hasValidConfig(): boolean {
    return !!this.config.apiKey;
  }

  async enrichCompanyData(request: EnrichCompanyRequest): Promise<CompanyEnrichmentData> {
    try {
      // Clearbit requires domain for company lookup
      const domain = request.domain || this.extractDomainFromWebsite(request.website);

      if (!domain) {
        throw new Error('Domain is required for Clearbit enrichment');
      }

      const response = await this.client.get<ClearbitCompanyResponse>(`/companies/find`, {
        params: { domain },
      });

      const clearbitData = response.data;

      return this.transformClearbitData(clearbitData);
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Company not found in Clearbit - return empty data with low confidence
        return {
          confidence: 0,
          lastUpdated: new Date(),
        };
      }

      throw error;
    }
  }

  /**
   * Transform Clearbit API response to our internal format
   */
  private transformClearbitData(data: ClearbitCompanyResponse): CompanyEnrichmentData {
    const confidence = this.calculateConfidence(data);

    return {
      name: data.name,
      domain: data.domain,
      website: data.site?.url,
      description: data.description,
      industry: data.category?.industry,
      headquarters: this.formatLocation(data.geo),
      location: data.location,
      size: data.metrics?.employeesRange,
      employeeCount: data.metrics?.employees,
      founded: data.foundedYear,
      annualRevenue: data.metrics?.estimatedAnnualRevenue,
      technologies: data.tech || [],
      keywords: data.tags || [],
      linkedinUrl: data.linkedin?.handle
        ? `https://linkedin.com/company/${data.linkedin.handle}`
        : undefined,
      twitterHandle: data.twitter?.handle,
      facebookUrl: data.facebook?.handle
        ? `https://facebook.com/${data.facebook.handle}`
        : undefined,
      logoUrl: data.logo,
      confidence,
      lastUpdated: new Date(),
    };
  }

  /**
   * Calculate confidence score based on data completeness
   */
  private calculateConfidence(data: ClearbitCompanyResponse): number {
    let score = 0;
    let maxScore = 0;

    // Core fields (higher weight)
    const coreFields = [
      { field: data.name, weight: 15 },
      { field: data.domain, weight: 15 },
      { field: data.description, weight: 10 },
      { field: data.category?.industry, weight: 10 },
      { field: data.logo, weight: 8 },
    ];

    // Additional fields (lower weight)
    const additionalFields = [
      { field: data.foundedYear, weight: 5 },
      { field: data.metrics?.employees, weight: 5 },
      { field: data.metrics?.estimatedAnnualRevenue, weight: 5 },
      { field: data.location, weight: 4 },
      { field: data.linkedin?.handle, weight: 3 },
      { field: data.twitter?.handle, weight: 3 },
      { field: data.tech?.length, weight: 2 },
      { field: data.tags?.length, weight: 2 },
    ];

    const allFields = [...coreFields, ...additionalFields];

    for (const { field, weight } of allFields) {
      maxScore += weight;
      if (field) {
        score += weight;
      }
    }

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Format geographic location from Clearbit geo data
   */
  private formatLocation(geo?: ClearbitCompanyResponse['geo']): string | undefined {
    if (!geo) {
      return undefined;
    }

    const parts = [];
    if (geo.city) {
      parts.push(geo.city);
    }
    if (geo.state) {
      parts.push(geo.state);
    }
    if (geo.country) {
      parts.push(geo.country);
    }

    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  /**
   * Extract domain from website URL
   */
  private extractDomainFromWebsite(website?: string): string | undefined {
    if (!website) {
      return undefined;
    }

    try {
      const url = new URL(website.startsWith('http') ? website : `https://${website}`);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  /**
   * Setup rate limiting for Clearbit API
   */
  private setupRateLimiting(): void {
    const rateLimit = this.config.rateLimit;
    if (!rateLimit) {
      return;
    }

    let requestCount = 0;
    let resetTime = Date.now() + 60 * 1000; // Reset every minute

    this.client.interceptors.request.use(config => {
      const now = Date.now();

      // Reset counter if time window has passed
      if (now > resetTime) {
        requestCount = 0;
        resetTime = now + 60 * 1000;
      }

      // Check rate limit
      if (requestCount >= rateLimit.requestsPerMinute) {
        const waitTime = resetTime - now;
        throw new Error(`Rate limit exceeded. Wait ${waitTime}ms before retrying.`);
      }

      requestCount++;
      return config;
    });

    // Handle rate limit responses
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            error.retryAfterMs = parseInt(retryAfter) * 1000;
          }
        }
        return Promise.reject(error);
      }
    );
  }
}

export default ClearbitEnrichmentService;
