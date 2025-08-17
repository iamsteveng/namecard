/**
 * Base Enrichment Service
 *
 * Core service for managing multi-source company data enrichment
 */

import {
  EnrichmentSource,
  EnrichmentStatus,
  CompanyEnrichmentData,
  EnrichCompanyRequest,
  EnrichCompanyResponse,
  EnrichmentSourceConfig,
} from '@namecard/shared/types/enrichment.types';
import { PrismaClient } from '@prisma/client';

export abstract class BaseEnrichmentService {
  protected prisma: PrismaClient;
  protected source: EnrichmentSource;
  protected config: EnrichmentSourceConfig;

  constructor(prisma: PrismaClient, source: EnrichmentSource, config: EnrichmentSourceConfig) {
    this.prisma = prisma;
    this.source = source;
    this.config = config;
  }

  /**
   * Abstract method to be implemented by each source
   */
  abstract enrichCompanyData(request: EnrichCompanyRequest): Promise<CompanyEnrichmentData>;

  /**
   * Check if this source is enabled and has valid configuration
   */
  isEnabled(): boolean {
    return this.config.enabled && this.hasValidConfig();
  }

  /**
   * Validate source-specific configuration
   */
  protected abstract hasValidConfig(): boolean;

  /**
   * Main enrichment method with error handling and persistence
   */
  async enrichCompany(request: EnrichCompanyRequest): Promise<EnrichCompanyResponse> {
    const startTime = Date.now();

    try {
      // Check if source is enabled
      if (!this.isEnabled()) {
        throw new EnrichmentError({
          code: 'SOURCE_DISABLED',
          message: `Enrichment source ${this.source} is disabled or misconfigured`,
          source: this.source,
          retryable: false,
        });
      }

      // Find or create company record
      const company = await this.findOrCreateCompany(request);

      // Check if we need to refresh data
      const existingEnrichment = await this.getExistingEnrichment(company.id);
      if (existingEnrichment && !request.forceRefresh && this.isDataFresh(existingEnrichment)) {
        return this.buildResponseFromExisting(company, existingEnrichment, startTime);
      }

      // Perform enrichment
      const enrichmentData = await this.enrichCompanyData(request);

      // Save enrichment results
      await this.saveEnrichmentResults(company.id, enrichmentData, 'enriched');

      // Update company with merged data
      const updatedCompany = await this.updateCompanyWithEnrichedData(company.id, enrichmentData);

      return {
        success: true,
        companyId: company.id,
        enrichmentData,
        sources: {
          [this.source]: {
            status: 'enriched' as EnrichmentStatus,
            confidence: enrichmentData.confidence || 0,
            dataPoints: this.countDataPoints(enrichmentData),
          },
        },
        overallConfidence: enrichmentData.confidence || 0,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const enrichmentError = this.handleError(error);

      // Try to save error state if we have a company
      if (request.companyName || request.domain) {
        try {
          const company = await this.findOrCreateCompany(request);
          await this.saveEnrichmentResults(company.id, null, 'failed', enrichmentError.message);
        } catch (saveError) {
          console.error('Failed to save error state:', saveError);
        }
      }

      return {
        success: false,
        companyId: '',
        enrichmentData: {},
        sources: {
          [this.source]: {
            status: 'failed' as EnrichmentStatus,
            confidence: 0,
            dataPoints: 0,
            error: enrichmentError.message,
          },
        },
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Find existing company or create new one
   */
  protected async findOrCreateCompany(request: EnrichCompanyRequest) {
    // Try to find by domain first
    if (request.domain) {
      const existing = await this.prisma.company.findUnique({
        where: { domain: request.domain },
      });
      if (existing) {
        return existing;
      }
    }

    // Try to find by name
    if (request.companyName) {
      const existing = await this.prisma.company.findUnique({
        where: { name: request.companyName },
      });
      if (existing) {
        return existing;
      }
    }

    // Create new company
    return await this.prisma.company.create({
      data: {
        name:
          request.companyName ||
          this.extractCompanyNameFromDomain(request.domain) ||
          'Unknown Company',
        domain: request.domain,
        website: request.website,
      },
    });
  }

  /**
   * Get existing enrichment record for this source
   */
  protected async getExistingEnrichment(companyId: string) {
    return await this.prisma.companyEnrichment.findUnique({
      where: {
        companyId_source: {
          companyId,
          source: this.source,
        },
      },
    });
  }

  /**
   * Check if existing enrichment data is still fresh
   */
  protected isDataFresh(enrichment: any): boolean {
    if (!enrichment.enrichedAt) {
      return false;
    }

    const ageMs = Date.now() - enrichment.enrichedAt.getTime();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    return ageMs < maxAgeMs;
  }

  /**
   * Save enrichment results to database
   */
  protected async saveEnrichmentResults(
    companyId: string,
    data: CompanyEnrichmentData | null,
    status: EnrichmentStatus,
    errorMessage?: string
  ) {
    return await this.prisma.companyEnrichment.upsert({
      where: {
        companyId_source: {
          companyId,
          source: this.source,
        },
      },
      create: {
        companyId,
        source: this.source,
        status,
        confidence: data?.confidence || 0,
        rawData: data ? JSON.parse(JSON.stringify(data)) : null,
        enrichedAt: status === 'enriched' ? new Date() : null,
        errorMessage,
      },
      update: {
        status,
        confidence: data?.confidence || 0,
        rawData: data ? JSON.parse(JSON.stringify(data)) : null,
        enrichedAt: status === 'enriched' ? new Date() : undefined,
        errorMessage,
        retryCount: status === 'failed' ? { increment: 1 } : undefined,
      },
    });
  }

  /**
   * Update company record with enriched data
   */
  protected async updateCompanyWithEnrichedData(companyId: string, data: CompanyEnrichmentData) {
    // Get current company data to merge
    const currentCompany = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!currentCompany) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // Merge data intelligently (prefer higher confidence, more recent data)
    const mergedData = this.mergeCompanyData(currentCompany, data);

    return await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...mergedData,
        lastEnrichmentDate: new Date(),
        overallEnrichmentScore: data.confidence || 0,
      },
    });
  }

  /**
   * Merge existing company data with new enrichment data
   */
  protected mergeCompanyData(existing: any, newData: CompanyEnrichmentData): any {
    return {
      name: newData.name || existing.name,
      domain: newData.domain || existing.domain,
      industry: newData.industry || existing.industry,
      size: newData.size || existing.size,
      headquarters: newData.headquarters || existing.headquarters,
      location: newData.location || existing.location,
      website: newData.website || existing.website,
      description: newData.description || existing.description,
      logoUrl: newData.logoUrl || existing.logoUrl,
      founded: newData.founded || existing.founded,
      employeeCount: newData.employeeCount || existing.employeeCount,
      annualRevenue: newData.annualRevenue || existing.annualRevenue,
      funding: newData.funding || existing.funding,
      technologies: this.mergeArrays(existing.technologies, newData.technologies),
      keywords: this.mergeArrays(existing.keywords, newData.keywords),
      linkedinUrl: newData.linkedinUrl || existing.linkedinUrl,
      twitterHandle: newData.twitterHandle || existing.twitterHandle,
      facebookUrl: newData.facebookUrl || existing.facebookUrl,
    };
  }

  /**
   * Utility methods
   */
  protected mergeArrays(existing: string[] = [], newItems: string[] = []): string[] {
    const combined = [...existing, ...newItems];
    return [...new Set(combined)]; // Remove duplicates
  }

  protected extractCompanyNameFromDomain(domain?: string): string | null {
    if (!domain) {
      return null;
    }

    // Remove www. and extract company name
    const cleanDomain = domain.replace(/^www\./, '');
    const parts = cleanDomain.split('.');

    if (parts.length > 0) {
      // Capitalize first letter
      const name = parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }

    return null;
  }

  protected countDataPoints(data: CompanyEnrichmentData): number {
    let count = 0;
    const fields = [
      'name',
      'domain',
      'website',
      'description',
      'industry',
      'headquarters',
      'location',
      'size',
      'employeeCount',
      'founded',
      'annualRevenue',
      'funding',
      'linkedinUrl',
      'twitterHandle',
      'facebookUrl',
      'logoUrl',
    ];

    for (const field of fields) {
      if (data[field as keyof CompanyEnrichmentData]) {
        count++;
      }
    }

    // Count array fields
    if (data.technologies?.length) {
      count += data.technologies.length;
    }
    if (data.keywords?.length) {
      count += data.keywords.length;
    }

    return count;
  }

  protected buildResponseFromExisting(
    company: any,
    enrichment: any,
    startTime: number
  ): EnrichCompanyResponse {
    const enrichmentData: CompanyEnrichmentData = enrichment.rawData || {};

    return {
      success: true,
      companyId: company.id,
      enrichmentData,
      sources: {
        [this.source]: {
          status: enrichment.status as EnrichmentStatus,
          confidence: enrichment.confidence || 0,
          dataPoints: this.countDataPoints(enrichmentData),
        },
      },
      overallConfidence: enrichment.confidence || 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  protected handleError(error: any): EnrichmentError {
    if (error instanceof EnrichmentError) {
      return error;
    }

    // Handle different types of errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new EnrichmentError({
        code: 'NETWORK_ERROR',
        message: `Network error connecting to ${this.source}: ${error.message}`,
        source: this.source,
        retryable: true,
      });
    }

    if (error.response?.status === 429) {
      return new EnrichmentError({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded for ${this.source}`,
        source: this.source,
        retryable: true,
        details: {
          retryAfter: error.response.headers['retry-after'],
        },
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return new EnrichmentError({
        code: 'AUTHENTICATION_ERROR',
        message: `Authentication failed for ${this.source}`,
        source: this.source,
        retryable: false,
      });
    }

    // Generic error
    return new EnrichmentError({
      code: 'UNKNOWN_ERROR',
      message: `Unknown error in ${this.source}: ${error.message}`,
      source: this.source,
      retryable: true,
    });
  }
}

/**
 * Custom error class for enrichment operations
 */
class EnrichmentError extends Error {
  public code: string;
  public source?: EnrichmentSource;
  public retryable: boolean;
  public details?: any;

  constructor(options: {
    code: string;
    message: string;
    source?: EnrichmentSource;
    retryable: boolean;
    details?: any;
  }) {
    super(options.message);
    this.name = 'EnrichmentError';
    this.code = options.code;
    this.source = options.source;
    this.retryable = options.retryable;
    this.details = options.details;
  }
}

export { EnrichmentError };
