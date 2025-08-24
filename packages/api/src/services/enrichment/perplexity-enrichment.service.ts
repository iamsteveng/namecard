/**
 * Perplexity AI Enrichment Service
 *
 * Real-time AI-powered company research using Perplexity's structured output API
 */

import {
  EnrichmentSourceConfig,
  EnrichCompanyRequest,
  EnrichCompanyResponse,
  EnrichBusinessCardRequest,
  EnrichBusinessCardResponse,
  CompanyEnrichmentData,
  BusinessCardEnrichmentData,
  PerplexityCompanyResponse,
  PerplexityBusinessCardResponse,
} from '@namecard/shared/types/enrichment.types';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

import { BaseEnrichmentService } from './base-enrichment.service.js';

export class PerplexityEnrichmentService extends BaseEnrichmentService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(prisma: PrismaClient, config: EnrichmentSourceConfig) {
    super(prisma, 'perplexity', config);

    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.perplexity.ai';
    this.model = 'sonar'; // Use the standard sonar model
    this.timeout = config.timeout || 30000; // 30 seconds timeout

    if (!this.apiKey) {
      console.warn('Perplexity API key not configured');
    } else if (this.isDummyApiKey(this.apiKey)) {
      console.warn('Perplexity API key appears to be a dummy/placeholder value');
    }
  }

  /**
   * Check if service is properly configured and enabled
   */
  override isEnabled(): boolean {
    return this.config.enabled && !!this.apiKey && !this.isDummyApiKey(this.apiKey);
  }

  /**
   * Validate Perplexity-specific configuration
   */
  protected override hasValidConfig(): boolean {
    return !!this.apiKey && !this.isDummyApiKey(this.apiKey) && !!this.baseUrl;
  }

  /**
   * Check if API key is a dummy/placeholder value
   */
  private isDummyApiKey(key: string): boolean {
    const dummyPatterns = [
      /^dummy/i,
      /^test/i,
      /^placeholder/i,
      /^example/i,
      /^fake/i,
      /^mock/i,
      /development/i,
      /staging/i,
    ];
    
    return dummyPatterns.some(pattern => pattern.test(key)) || key.length < 20;
  }

  /**
   * Abstract method implementation for base class
   */
  override async enrichCompanyData(request: EnrichCompanyRequest): Promise<CompanyEnrichmentData> {
    const response = await this.enrichCompany(request);
    return response.enrichmentData;
  }

  /**
   * Enrich company data using Perplexity AI research
   */
  override async enrichCompany(request: EnrichCompanyRequest): Promise<EnrichCompanyResponse> {
    const startTime = Date.now();

    try {
      if (!this.isEnabled()) {
        throw new Error('Perplexity enrichment service is not enabled or configured');
      }

      // Build research query
      const query = this.buildCompanyResearchQuery(request);
      console.log(`Perplexity research query: ${query}`);

      // Make API request with structured output
      const researchResponse = await this.callPerplexityAPI(query);

      // Transform Perplexity response to our enrichment format
      const enrichmentData = this.transformPerplexityResponse(researchResponse, query);

      // Calculate confidence based on data quality and citation count
      const confidence = this.calculateConfidence(researchResponse);

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        companyId: request.companyName || request.domain || 'unknown',
        enrichmentData,
        sources: {
          perplexity: {
            status: 'enriched',
            confidence,
            dataPoints: this.countDataPoints(enrichmentData),
            error: undefined,
          },
        },
        overallConfidence: confidence,
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const companyId = request.companyName || request.domain || 'unknown';
      
      console.error('Perplexity company enrichment failed:', {
        companyId,
        error: errorMessage,
        apiKeyConfigured: !!this.apiKey,
        apiKeyValid: this.apiKey ? !this.isDummyApiKey(this.apiKey) : false,
        baseUrl: this.baseUrl,
        enabled: this.config.enabled,
        processingTime: Date.now() - startTime,
      });

      return {
        success: false,
        companyId,
        enrichmentData: {},
        sources: {
          perplexity: {
            status: 'failed',
            confidence: 0,
            dataPoints: 0,
            error: errorMessage,
          },
        },
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Enrich business card data with combined person and company research
   */
  async enrichBusinessCard(
    request: EnrichBusinessCardRequest
  ): Promise<EnrichBusinessCardResponse> {
    const startTime = Date.now();

    try {
      if (!this.isEnabled()) {
        throw new Error('Perplexity enrichment service is not enabled or configured');
      }

      // Build combined research query
      const query = this.buildBusinessCardResearchQuery(request);
      console.log(`Perplexity business card research query: ${query}`);

      // Make API request with unified structured output
      const researchResponse = await this.callPerplexityBusinessCardAPI(query);

      // Transform response to our enrichment format
      const enrichmentData = this.transformBusinessCardResponse(researchResponse, query);

      // Calculate confidence scores
      const personConfidence = this.calculatePersonConfidence(researchResponse);
      const companyConfidence = this.calculateCompanyConfidence(researchResponse);
      const overallConfidence = Math.round((personConfidence + companyConfidence) / 2);

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        cardId: request.cardId || undefined,
        enrichmentData,
        sources: {
          perplexity: {
            status: 'enriched',
            confidence: overallConfidence,
            dataPoints: this.countBusinessCardDataPoints(enrichmentData),
            error: undefined,
          },
        },
        overallConfidence,
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cardId = request.cardId || 'unknown';
      
      console.error('Perplexity business card enrichment failed:', {
        cardId,
        error: errorMessage,
        apiKeyConfigured: !!this.apiKey,
        apiKeyValid: this.apiKey ? !this.isDummyApiKey(this.apiKey) : false,
        baseUrl: this.baseUrl,
        enabled: this.config.enabled,
        processingTime: Date.now() - startTime,
      });

      return {
        success: false,
        cardId: request.cardId || undefined,
        enrichmentData: {},
        sources: {
          perplexity: {
            status: 'failed',
            confidence: 0,
            dataPoints: 0,
            error: errorMessage,
          },
        },
        overallConfidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build intelligent research query based on available company information
   */
  private buildCompanyResearchQuery(request: EnrichCompanyRequest): string {
    const companyName = request.companyName || 'Unknown Company';
    const domain = request.domain;
    const website = request.website;

    let query = `Research comprehensive information about ${companyName}`;

    if (domain) {
      query += ` (domain: ${domain})`;
    } else if (website) {
      query += ` (website: ${website})`;
    }

    query += `. Provide current and accurate information including: business description, industry classification, company size and employee count, headquarters location, founding year, business model, market position, recent news and developments, key leadership team members, main competitors, technology stack used, social media presence, and recent funding or financial information. Focus on factual, up-to-date information with reliable sources.`;

    return query;
  }

  /**
   * Build combined person and company research query for business cards
   */
  private buildBusinessCardResearchQuery(request: EnrichBusinessCardRequest): string {
    const personName = request.personName;
    const personTitle = request.personTitle;
    const companyName = request.companyName;
    const domain = request.domain;
    const website = request.website;

    let query = `Research comprehensive information about`;

    // Add person information if available
    if (personName) {
      query += ` the professional ${personName}`;
      if (personTitle) {
        query += ` who works as ${personTitle}`;
      }
    }

    // Add company information
    if (companyName) {
      if (personName) {
        query += ` and their company ${companyName}`;
      } else {
        query += ` the company ${companyName}`;
      }
    }

    // Add domain/website context
    if (domain) {
      query += ` (domain: ${domain})`;
    } else if (website) {
      query += ` (website: ${website})`;
    }

    query += `. Provide current and accurate information including:`;

    // Person research requirements
    if (personName && request.includePersonData !== false) {
      query += ` For the person: professional background, education, work experience, expertise areas, achievements, publications, speaking engagements, awards, recent activities, social media presence, and industry influence.`;
    }

    // Company research requirements
    if (companyName && request.includeCompanyData !== false) {
      query += ` For the company: business description, industry classification, size and employee count, headquarters location, founding year, business model, market position, recent news and developments, key leadership team, main competitors, technology stack, social media presence, and financial information.`;
    }

    query += ` Focus on factual, up-to-date information with reliable sources and provide proper citations for all information.`;

    return query;
  }

  /**
   * Call Perplexity API with structured output
   */
  private async callPerplexityAPI(query: string): Promise<PerplexityCompanyResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional business research assistant. Provide comprehensive, accurate company information with proper citations. Always include source URLs for verification.',
            },
            {
              role: 'user',
              content: query,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              schema: this.getCompanyResearchSchema(),
            },
          },
          temperature: 0.1, // Low temperature for consistent, factual responses
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perplexity API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          apiKeyLength: this.apiKey.length,
          baseUrl: this.baseUrl,
          model: this.model,
        });
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as any;

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from Perplexity API');
      }

      // Parse the JSON response
      const structuredResponse = JSON.parse(
        data.choices[0].message.content
      ) as PerplexityCompanyResponse;

      // Add processing metadata
      structuredResponse.researchMetadata = {
        ...structuredResponse.researchMetadata,
        processingTimeMs: Date.now() - Date.now(), // Will be updated by caller
        researchDate: new Date().toISOString(),
      };

      return structuredResponse;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('JSON.parse')) {
          throw new Error(`Failed to parse Perplexity response: ${error.message}`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred during Perplexity API call');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Call Perplexity API with business card structured output
   */
  private async callPerplexityBusinessCardAPI(
    query: string
  ): Promise<PerplexityBusinessCardResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional business research assistant specializing in comprehensive person and company intelligence. Provide accurate, detailed information with proper citations. Always include source URLs for verification and categorize citations by relevance to person, company, or both.',
            },
            {
              role: 'user',
              content: query,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              schema: this.getBusinessCardResearchSchema(),
            },
          },
          temperature: 0.1, // Low temperature for consistent, factual responses
          max_tokens: 4000, // Increased for combined person+company data
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perplexity API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          apiKeyLength: this.apiKey.length,
          baseUrl: this.baseUrl,
          model: this.model,
        });
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as any;

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from Perplexity API');
      }

      // Parse the JSON response
      const structuredResponse = JSON.parse(
        data.choices[0].message.content
      ) as PerplexityBusinessCardResponse;

      // Add processing metadata
      structuredResponse.researchMetadata = {
        ...structuredResponse.researchMetadata,
        processingTimeMs: Date.now() - Date.now(), // Will be updated by caller
        researchDate: new Date().toISOString(),
      };

      return structuredResponse;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('JSON.parse')) {
          throw new Error(`Failed to parse Perplexity business card response: ${error.message}`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred during Perplexity business card API call');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the JSON schema for structured company research output
   */
  private getCompanyResearchSchema(): any {
    return this.getLegacyCompanySchema();
  }

  /**
   * Get the JSON schema for combined business card research output
   */
  private getBusinessCardResearchSchema(): any {
    return {
      type: 'object',
      properties: {
        person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            title: { type: 'string' },
            currentRole: { type: 'string' },
            education: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  institution: { type: 'string' },
                  degree: { type: 'string' },
                  field: { type: 'string' },
                  year: { type: 'number' },
                },
                required: ['institution'],
              },
            },
            experience: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company: { type: 'string' },
                  role: { type: 'string' },
                  duration: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['company', 'role'],
              },
            },
            expertise: {
              type: 'array',
              items: { type: 'string' },
            },
            achievements: {
              type: 'array',
              items: { type: 'string' },
            },
            publications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  publishDate: { type: 'string' },
                  venue: { type: 'string' },
                },
                required: ['title'],
              },
            },
            recentActivities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  date: { type: 'string' },
                  url: { type: 'string' },
                  source: { type: 'string' },
                },
                required: ['title', 'description', 'source'],
              },
            },
            socialMedia: {
              type: 'object',
              properties: {
                linkedinUrl: { type: 'string' },
                twitterHandle: { type: 'string' },
                personalWebsite: { type: 'string' },
                blogUrl: { type: 'string' },
                githubUrl: { type: 'string' },
              },
            },
          },
          required: ['name'],
        },
        company: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            industry: { type: 'string' },
            website: { type: 'string' },
            headquarters: { type: 'string' },
            employeeCount: { type: 'number' },
            founded: { type: 'number' },
            annualRevenue: { type: 'string' },
            businessModel: { type: 'string' },
            marketPosition: { type: 'string' },
          },
          required: ['name'],
        },
        recentNews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              url: { type: 'string' },
              publishDate: { type: 'string' },
              source: { type: 'string' },
            },
            required: ['title', 'summary', 'source'],
          },
        },
        keyPeople: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'role'],
          },
        },
        competitors: {
          type: 'array',
          items: { type: 'string' },
        },
        recentDevelopments: {
          type: 'array',
          items: { type: 'string' },
        },
        technologies: {
          type: 'array',
          items: { type: 'string' },
        },
        socialMedia: {
          type: 'object',
          properties: {
            linkedinUrl: { type: 'string' },
            twitterHandle: { type: 'string' },
            facebookUrl: { type: 'string' },
          },
        },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              source: { type: 'string' },
              relevance: { type: 'number' },
              category: { type: 'string', enum: ['person', 'company', 'both'] },
            },
            required: ['url', 'title', 'source', 'relevance', 'category'],
          },
        },
        researchMetadata: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            personConfidence: { type: 'number' },
            companyConfidence: { type: 'number' },
            overallConfidence: { type: 'number' },
            processingTimeMs: { type: 'number' },
            researchDate: { type: 'string' },
          },
          required: [
            'query',
            'personConfidence',
            'companyConfidence',
            'overallConfidence',
            'researchDate',
          ],
        },
      },
      required: ['citations', 'researchMetadata'],
    };
  }

  /**
   * Legacy company schema for backward compatibility
   */
  private getLegacyCompanySchema(): any {
    return {
      type: 'object',
      properties: {
        company: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            industry: { type: 'string' },
            website: { type: 'string' },
            headquarters: { type: 'string' },
            employeeCount: { type: 'number' },
            founded: { type: 'number' },
            annualRevenue: { type: 'string' },
            businessModel: { type: 'string' },
            marketPosition: { type: 'string' },
          },
          required: ['name'],
        },
        recentNews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              url: { type: 'string' },
              publishDate: { type: 'string' },
              source: { type: 'string' },
            },
            required: ['title', 'summary', 'source'],
          },
        },
        keyPeople: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'role'],
          },
        },
        competitors: {
          type: 'array',
          items: { type: 'string' },
        },
        recentDevelopments: {
          type: 'array',
          items: { type: 'string' },
        },
        technologies: {
          type: 'array',
          items: { type: 'string' },
        },
        socialMedia: {
          type: 'object',
          properties: {
            linkedinUrl: { type: 'string' },
            twitterHandle: { type: 'string' },
            facebookUrl: { type: 'string' },
          },
        },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              source: { type: 'string' },
              relevance: { type: 'number' },
            },
            required: ['url', 'title', 'source', 'relevance'],
          },
        },
        researchMetadata: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            confidence: { type: 'number' },
            processingTimeMs: { type: 'number' },
            researchDate: { type: 'string' },
          },
          required: ['query', 'confidence', 'researchDate'],
        },
      },
      required: ['company', 'citations', 'researchMetadata'],
    };
  }

  /**
   * Transform Perplexity response to our enrichment data format
   */
  private transformPerplexityResponse(
    response: PerplexityCompanyResponse,
    originalQuery: string
  ): CompanyEnrichmentData {
    const company = response.company;
    const socialMedia = response.socialMedia;

    return {
      // Basic company info
      name: company.name,
      description: company.description,
      industry: company.industry,
      website: company.website,
      headquarters: company.headquarters,
      employeeCount: company.employeeCount,
      founded: company.founded,
      annualRevenue: company.annualRevenue,

      // Business information
      businessModel: company.businessModel,
      marketPosition: company.marketPosition,

      // Array data
      technologies: response.technologies,
      competitors: response.competitors,

      // AI Research specific data
      recentNews: response.recentNews,
      keyPeople: response.keyPeople,
      recentDevelopments: response.recentDevelopments,

      // Social media
      linkedinUrl: socialMedia?.linkedinUrl,
      twitterHandle: socialMedia?.twitterHandle,
      facebookUrl: socialMedia?.facebookUrl,

      // Research metadata
      citations: response.citations?.map((citation: any) => ({
        url: citation.url,
        title: citation.title,
        source: citation.source,
        accessDate: new Date().toISOString(),
        relevance: citation.relevance,
      })),
      researchQuery: originalQuery,
      researchDate: new Date(),

      // Metadata
      confidence: (response as any).researchMetadata?.confidence || 85,
      lastUpdated: new Date(),
    };
  }

  /**
   * Transform Perplexity business card response to our enrichment format
   */
  private transformBusinessCardResponse(
    response: PerplexityBusinessCardResponse,
    originalQuery: string
  ): BusinessCardEnrichmentData {
    const personData = response.person
      ? {
          name: response.person.name,
          title: response.person.title,
          currentRole: response.person.currentRole,
          education: response.person.education,
          experience: response.person.experience,
          expertise: response.person.expertise,
          achievements: response.person.achievements,
          publications: response.person.publications,
          speakingEngagements: response.person.speakingEngagements,
          awards: response.person.awards,
          recentActivities: response.person.recentActivities,
          linkedinUrl: response.person.socialMedia?.linkedinUrl,
          twitterHandle: response.person.socialMedia?.twitterHandle,
          personalWebsite: response.person.socialMedia?.personalWebsite,
          blogUrl: response.person.socialMedia?.blogUrl,
          githubUrl: response.person.socialMedia?.githubUrl,
          confidence: response.researchMetadata?.personConfidence || 85,
          lastUpdated: new Date(),
        }
      : undefined;

    const companyData = response.company
      ? {
          name: response.company.name,
          description: response.company.description,
          industry: response.company.industry,
          website: response.company.website,
          headquarters: response.company.headquarters,
          employeeCount: response.company.employeeCount,
          founded: response.company.founded,
          annualRevenue: response.company.annualRevenue,
          businessModel: response.company.businessModel,
          marketPosition: response.company.marketPosition,
          technologies: response.technologies,
          competitors: response.competitors,
          recentNews: response.recentNews,
          keyPeople: response.keyPeople,
          recentDevelopments: response.recentDevelopments,
          linkedinUrl: response.socialMedia?.linkedinUrl,
          twitterHandle: response.socialMedia?.twitterHandle,
          facebookUrl: response.socialMedia?.facebookUrl,
          citations: response.citations
            ?.filter((c: any) => c.category === 'company' || c.category === 'both')
            .map((citation: any) => ({
              url: citation.url,
              title: citation.title,
              source: citation.source,
              accessDate: new Date().toISOString(),
              relevance: citation.relevance,
            })),
          researchQuery: originalQuery,
          researchDate: new Date(),
          confidence: response.researchMetadata?.companyConfidence || 85,
          lastUpdated: new Date(),
        }
      : undefined;

    return {
      personData,
      companyData,
      citations: response.citations?.map((citation: any) => ({
        url: citation.url,
        title: citation.title,
        source: citation.source,
        accessDate: new Date().toISOString(),
        relevance: citation.relevance,
        category: citation.category,
      })),
      researchQuery: originalQuery,
      researchDate: new Date(),
      personConfidence: response.researchMetadata?.personConfidence || 0,
      companyConfidence: response.researchMetadata?.companyConfidence || 0,
      overallConfidence: response.researchMetadata?.overallConfidence || 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateConfidence(response: PerplexityCompanyResponse): number {
    let confidence = (response as any).researchMetadata?.confidence || 85;

    // Boost confidence based on data richness
    if (response.citations?.length >= 5) {
      confidence += 5;
    }
    if (response.recentNews?.length >= 3) {
      confidence += 3;
    }
    if (response.keyPeople?.length >= 2) {
      confidence += 2;
    }
    if (response.competitors?.length >= 3) {
      confidence += 3;
    }
    if (response.technologies?.length >= 3) {
      confidence += 2;
    }

    // Ensure confidence stays within bounds
    return Math.min(100, Math.max(0, Math.round(confidence)));
  }

  /**
   * Calculate person confidence score
   */
  private calculatePersonConfidence(response: PerplexityBusinessCardResponse): number {
    let confidence = response.researchMetadata?.personConfidence || 75;

    if (response.person) {
      // Boost confidence based on data richness
      if (response.person.education?.length >= 1) {
        confidence += 5;
      }
      if (response.person.experience?.length >= 2) {
        confidence += 5;
      }
      if (response.person.achievements?.length >= 1) {
        confidence += 3;
      }
      if (response.person.publications?.length >= 1) {
        confidence += 3;
      }
      if (response.person.recentActivities?.length >= 1) {
        confidence += 2;
      }
      if (response.person.socialMedia?.linkedinUrl) {
        confidence += 2;
      }
    }

    // Ensure confidence stays within bounds
    return Math.min(100, Math.max(0, Math.round(confidence)));
  }

  /**
   * Calculate company confidence score (enhanced for business card context)
   */
  private calculateCompanyConfidence(response: PerplexityBusinessCardResponse): number {
    let confidence = response.researchMetadata?.companyConfidence || 75;

    if (response.company) {
      // Boost confidence based on data richness
      if (
        response.citations?.filter((c: any) => c.category === 'company' || c.category === 'both')
          .length >= 3
      ) {
        confidence += 5;
      }
      if (response.recentNews?.length >= 2) {
        confidence += 3;
      }
      if (response.keyPeople?.length >= 2) {
        confidence += 2;
      }
      if (response.competitors?.length >= 2) {
        confidence += 3;
      }
      if (response.technologies?.length >= 2) {
        confidence += 2;
      }
    }

    // Ensure confidence stays within bounds
    return Math.min(100, Math.max(0, Math.round(confidence)));
  }

  /**
   * Count data points for metrics
   */
  protected override countDataPoints(data: CompanyEnrichmentData): number {
    let count = 0;

    // Count basic fields
    const basicFields = [
      'name',
      'description',
      'industry',
      'website',
      'headquarters',
      'employeeCount',
      'founded',
      'annualRevenue',
      'businessModel',
      'marketPosition',
      'linkedinUrl',
      'twitterHandle',
      'facebookUrl',
    ];

    for (const field of basicFields) {
      if (data[field as keyof CompanyEnrichmentData]) {
        count++;
      }
    }

    // Count array fields
    if (data.technologies?.length) {
      count += data.technologies.length;
    }
    if (data.competitors?.length) {
      count += data.competitors.length;
    }
    if (data.recentNews?.length) {
      count += data.recentNews.length;
    }
    if (data.keyPeople?.length) {
      count += data.keyPeople.length;
    }
    if (data.recentDevelopments?.length) {
      count += data.recentDevelopments.length;
    }
    if (data.citations?.length) {
      count += data.citations.length;
    }

    return count;
  }

  /**
   * Count data points for business card enrichment metrics
   */
  private countBusinessCardDataPoints(data: BusinessCardEnrichmentData): number {
    let count = 0;

    // Count person data points
    if (data.personData) {
      const personFields = [
        'name',
        'title',
        'currentRole',
        'linkedinUrl',
        'twitterHandle',
        'personalWebsite',
        'blogUrl',
        'githubUrl',
      ];

      for (const field of personFields) {
        if (data.personData[field as keyof typeof data.personData]) {
          count++;
        }
      }

      // Count array fields
      if (data.personData.education?.length) {
        count += data.personData.education.length;
      }
      if (data.personData.experience?.length) {
        count += data.personData.experience.length;
      }
      if (data.personData.expertise?.length) {
        count += data.personData.expertise.length;
      }
      if (data.personData.achievements?.length) {
        count += data.personData.achievements.length;
      }
      if (data.personData.publications?.length) {
        count += data.personData.publications.length;
      }
      if (data.personData.recentActivities?.length) {
        count += data.personData.recentActivities.length;
      }
    }

    // Count company data points
    if (data.companyData) {
      const companyFields = [
        'name',
        'description',
        'industry',
        'website',
        'headquarters',
        'employeeCount',
        'founded',
        'annualRevenue',
        'businessModel',
        'marketPosition',
        'linkedinUrl',
        'twitterHandle',
        'facebookUrl',
      ];

      for (const field of companyFields) {
        if (data.companyData[field as keyof typeof data.companyData]) {
          count++;
        }
      }

      // Count array fields
      if (data.companyData.technologies?.length) {
        count += data.companyData.technologies.length;
      }
      if (data.companyData.competitors?.length) {
        count += data.companyData.competitors.length;
      }
      if (data.companyData.recentNews?.length) {
        count += data.companyData.recentNews.length;
      }
      if (data.companyData.keyPeople?.length) {
        count += data.companyData.keyPeople.length;
      }
      if (data.companyData.recentDevelopments?.length) {
        count += data.companyData.recentDevelopments.length;
      }
    }

    // Count citations
    if (data.citations?.length) {
      count += data.citations.length;
    }

    return count;
  }

  /**
   * Test API connectivity and configuration
   */
  async testConnection(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      if (!this.isEnabled()) {
        return false;
      }

      // Simple test query
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: 'Test connection',
            },
          ],
          max_tokens: 10,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Perplexity connection test failed:', error);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
