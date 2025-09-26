/**
 * Main Enrichment Service
 *
 * Orchestrates multi-source company data enrichment
 */

import {
  EnrichmentSource,
  EnrichmentSourceConfig,
  EnrichCompanyRequest,
  EnrichCompanyResponse,
  EnrichBusinessCardRequest,
  EnrichBusinessCardResponse,
  CompanyEnrichmentData,
  EnrichmentSettings,
} from '@namecard/shared/types/enrichment.types';
import { PrismaClient } from '@prisma/client';

import { BaseEnrichmentService } from './base-enrichment.service.js';
import { ClearbitEnrichmentService } from './clearbit-enrichment.service.js';
import { PerplexityEnrichmentService } from './perplexity-enrichment.service.js';

export class EnrichmentService {
  private prisma: PrismaClient;
  private sources: Map<EnrichmentSource, BaseEnrichmentService>;
  private settings: EnrichmentSettings;

  constructor(
    prisma: PrismaClient,
    sourceConfigs: EnrichmentSourceConfig[],
    settings: EnrichmentSettings
  ) {
    this.prisma = prisma;
    this.sources = new Map();
    this.settings = settings;

    // Initialize available enrichment sources
    this.initializeSources(sourceConfigs);
  }

  /**
   * Initialize enrichment sources based on configuration
   */
  private initializeSources(configs: EnrichmentSourceConfig[]): void {
    for (const config of configs) {
      if (!config.enabled) {
        continue;
      }

      try {
        switch (config.source) {
          case 'clearbit':
            this.sources.set('clearbit', new ClearbitEnrichmentService(this.prisma, config));
            break;

          // Future enrichment sources can be added here
          case 'linkedin':
            // this.sources.set('linkedin', new LinkedInEnrichmentService(this.prisma, config));
            console.log('LinkedIn enrichment service not yet implemented');
            break;

          case 'crunchbase':
            // this.sources.set('crunchbase', new CrunchbaseEnrichmentService(this.prisma, config));
            console.log('Crunchbase enrichment service not yet implemented');
            break;

          case 'perplexity':
            this.sources.set('perplexity', new PerplexityEnrichmentService(this.prisma, config));
            break;

          default:
            console.warn(`Unknown enrichment source: ${config.source}`);
        }
      } catch (error) {
        console.error(`Failed to initialize ${config.source} enrichment service:`, error);
      }
    }

    console.log(
      `Initialized ${this.sources.size} enrichment sources:`,
      Array.from(this.sources.keys())
    );
  }

  /**
   * Enrich company data using multiple sources
   */
  async enrichCompany(request: EnrichCompanyRequest): Promise<EnrichCompanyResponse> {
    const startTime = Date.now();
    const requestedSources = request.sources || this.settings.enabledSources;
    const results: EnrichCompanyResponse[] = [];

    try {
      // Get available sources that are enabled and configured
      const availableSources = requestedSources.filter(
        (source: EnrichmentSource) => this.sources.has(source) && this.sources.get(source)!.isEnabled()
      );

      if (availableSources.length === 0) {
        throw new Error('No enabled enrichment sources available');
      }

      console.log(`Enriching company with sources: ${availableSources.join(', ')}`);

      // Execute enrichment from each source in parallel
      const enrichmentPromises = availableSources.map(async (source: EnrichmentSource) => {
        const service = this.sources.get(source)!;
        try {
          return await service.enrichCompany(request);
        } catch (error) {
          console.error(`Enrichment failed for source ${source}:`, error);
          return {
            success: false,
            companyId: '',
            enrichmentData: {},
            sources: {
              [source]: {
                status: 'failed',
                confidence: 0,
                dataPoints: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            },
            overallConfidence: 0,
            processingTimeMs: 0,
          } as EnrichCompanyResponse;
        }
      });

      // Wait for all enrichments to complete
      results.push(...(await Promise.all(enrichmentPromises)));

      // Merge results from all sources
      return this.mergeEnrichmentResults(results, startTime);
    } catch (error) {
      console.error('Enrichment orchestration error:', error);

      return {
        success: false,
        companyId: '',
        enrichmentData: {},
        sources: {},
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Merge enrichment results from multiple sources
   */
  private mergeEnrichmentResults(
    results: EnrichCompanyResponse[],
    startTime: number
  ): EnrichCompanyResponse {
    const successfulResults = results.filter(r => r.success);
    const allSources: EnrichCompanyResponse['sources'] = {};

    // Combine source information
    for (const result of results) {
      Object.assign(allSources, result.sources);
    }

    if (successfulResults.length === 0) {
      return {
        success: false,
        companyId: '',
        enrichmentData: {},
        sources: allSources,
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Use the first successful result as the base company ID
    const companyId = successfulResults[0].companyId;

    // Merge enrichment data using confidence-weighted approach
    const mergedData = this.mergeCompanyData(successfulResults.map(r => r.enrichmentData));

    // Calculate overall confidence based on source weights and individual confidences
    const overallConfidence = this.calculateOverallConfidence(successfulResults);

    return {
      success: true,
      companyId,
      enrichmentData: mergedData,
      sources: allSources,
      overallConfidence,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Merge company data from multiple sources using confidence weighting
   */
  private mergeCompanyData(dataArray: CompanyEnrichmentData[]): CompanyEnrichmentData {
    if (dataArray.length === 0) {
      return {};
    }
    if (dataArray.length === 1) {
      return dataArray[0];
    }

    const merged: CompanyEnrichmentData = {};
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
      'businessModel',
      'marketPosition',
    ] as const;

    // For each field, select the value from the source with highest confidence
    for (const field of fields) {
      let bestValue: any = undefined;
      let bestConfidence = 0;

      for (const data of dataArray) {
        const value = data[field];
        const confidence = data.confidence || 0;

        if (value && confidence > bestConfidence) {
          bestValue = value;
          bestConfidence = confidence;
        }
      }

      if (bestValue !== undefined) {
        (merged as any)[field] = bestValue;
      }
    }

    // Merge array fields (technologies, keywords, competitors, recentDevelopments) by combining unique values
    const arrayFields = ['technologies', 'keywords', 'competitors', 'recentDevelopments'] as const;
    for (const field of arrayFields) {
      const allValues: string[] = [];
      for (const data of dataArray) {
        if (data[field]?.length) {
          allValues.push(...data[field]!);
        }
      }
      if (allValues.length > 0) {
        merged[field] = [...new Set(allValues)]; // Remove duplicates
      }
    }

    // Handle complex array fields (recentNews, keyPeople, citations) - prefer most recent/relevant data
    const complexArrayFields = ['recentNews', 'keyPeople', 'citations'] as const;
    for (const field of complexArrayFields) {
      const allItems: any[] = [];
      for (const data of dataArray) {
        if (data[field]?.length) {
          allItems.push(...data[field]!);
        }
      }
      if (allItems.length > 0) {
        // For news and citations, sort by relevance/recency and take top items
        if (field === 'recentNews') {
          merged[field] = allItems
            .sort(
              (a, b) =>
                new Date(b.publishDate || '').getTime() - new Date(a.publishDate || '').getTime()
            )
            .slice(0, 10); // Keep top 10 most recent
        } else if (field === 'citations') {
          merged[field] = allItems
            .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
            .slice(0, 15); // Keep top 15 most relevant
        } else {
          merged[field] = allItems.slice(0, 8); // Limit other complex arrays
        }
      }
    }

    // Handle research metadata - prefer most recent
    if (dataArray.some(d => d.researchQuery)) {
      const mostRecent = dataArray
        .filter(d => d.researchDate)
        .sort(
          (a, b) => new Date(b.researchDate!).getTime() - new Date(a.researchDate!).getTime()
        )[0];

      if (mostRecent) {
        merged.researchQuery = mostRecent.researchQuery;
        merged.researchDate = mostRecent.researchDate;
      }
    }

    // Set confidence to the highest individual confidence
    merged.confidence = Math.max(...dataArray.map(d => d.confidence || 0));
    merged.lastUpdated = new Date();

    return merged;
  }

  /**
   * Calculate overall confidence score from multiple sources
   */
  private calculateOverallConfidence(results: EnrichCompanyResponse[]): number {
    if (results.length === 0) {
      return 0;
    }

    let totalWeightedConfidence = 0;
    let totalWeight = 0;

    for (const result of results) {
      const confidence = result.overallConfidence;
      const sourceKey = Object.keys(result.sources)[0];
      const weight = this.getSourceWeight(sourceKey as EnrichmentSource);

      totalWeightedConfidence += confidence * weight;
      totalWeight += weight;
    }

    // Boost confidence if multiple sources agree
    const agreementBonus = results.length > 1 ? Math.min(10, (results.length - 1) * 5) : 0;
    const baseConfidence = totalWeight > 0 ? totalWeightedConfidence / totalWeight : 0;

    return Math.min(100, Math.round(baseConfidence + agreementBonus));
  }

  /**
   * Get source weight for confidence calculation
   */
  private getSourceWeight(source: EnrichmentSource): number {
    return this.settings.sourcePreferences?.[source]?.weight || 1.0;
  }

  /**
   * Get enrichment status for a company
   */
  async getCompanyEnrichmentStatus(companyId: string): Promise<{
    company: any;
    enrichments: any[];
    overallScore: number;
    lastEnriched: Date | null;
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        enrichments: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    return {
      company,
      enrichments: company.enrichments,
      overallScore: company.overallEnrichmentScore || 0,
      lastEnriched: company.lastEnrichmentDate,
    };
  }

  /**
   * Get available enrichment sources
   */
  getAvailableSources(): EnrichmentSource[] {
    return Array.from(this.sources.keys()).filter(
      (source: EnrichmentSource) => this.sources.get(source)!.isEnabled()
    );
  }

  /**
   * Enrich business card data with combined person and company research
   */
  async enrichBusinessCard(
    request: EnrichBusinessCardRequest
  ): Promise<EnrichBusinessCardResponse> {
    const startTime = Date.now();
    const requestedSources = request.sources || this.settings.enabledSources;

    try {
      // For unified enrichment, we only use Perplexity for now
      const perplexitySource = requestedSources.find(
        (source: EnrichmentSource) => source === 'perplexity'
      );

      if (!perplexitySource || !this.sources.has('perplexity')) {
        throw new Error('Perplexity enrichment source not available for business card enrichment');
      }

      const perplexityService = this.sources.get('perplexity') as PerplexityEnrichmentService;

      if (!perplexityService.isEnabled()) {
        throw new Error('Perplexity enrichment service is not enabled');
      }

      console.log(`Enriching business card with Perplexity:`, {
        personName: request.personName,
        companyName: request.companyName,
        includePersonData: request.includePersonData,
        includeCompanyData: request.includeCompanyData,
      });

      // Call the unified business card enrichment method
      const result = await (perplexityService as any).enrichBusinessCard(request);

      if (result.success) {
        return {
          success: true,
          cardId: request.cardId,
          enrichmentData: result.enrichmentData,
          sources: result.sources,
          overallConfidence: result.overallConfidence,
          processingTimeMs: Date.now() - startTime,
        };
      } else {
        throw new Error('Business card enrichment failed');
      }
    } catch (error) {
      console.error('Business card enrichment orchestration error:', error);

      return {
        success: false,
        cardId: request.cardId,
        enrichmentData: {},
        sources: {
          perplexity: {
            status: 'failed',
            confidence: 0,
            dataPoints: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Update enrichment settings
   */
  updateSettings(newSettings: Partial<EnrichmentSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Health check for all enrichment sources
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    sources: Record<
      EnrichmentSource,
      {
        enabled: boolean;
        configured: boolean;
        responsive: boolean;
        error?: string;
      }
    >;
  }> {
    const sourceStatus: Record<string, any> = {};
    let healthyCount = 0;
    let totalEnabled = 0;

    for (const [source, service] of this.sources) {
      const enabled = service.isEnabled();
      if (enabled) {
        totalEnabled++;
      }

      try {
        // Test basic connectivity/configuration
        const configured = service.isEnabled();
        sourceStatus[source] = {
          enabled,
          configured,
          responsive: configured, // For now, assume responsive if configured
        };

        if (configured) {
          healthyCount++;
        }
      } catch (error) {
        sourceStatus[source] = {
          enabled,
          configured: false,
          responsive: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalEnabled && totalEnabled > 0) {
      status = 'healthy';
    } else if (healthyCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      sources: sourceStatus as any,
    };
  }
}

export default EnrichmentService;
