/**
 * Frontend Enrichment Service
 * 
 * Service for enrichment API calls from the frontend
 */

import type { EnrichCardRequest, EnrichCardResponse } from '../types/enrichment.types';
import type { CompanyEnrichmentData, EnrichmentSource } from '@namecard/shared/types/enrichment.types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export interface EnrichmentHealthResponse {
  status: 'healthy' | 'unhealthy';
  sources: Record<EnrichmentSource, {
    enabled: boolean;
    status: 'healthy' | 'unhealthy';
    lastChecked: string;
  }>;
  availableSources: EnrichmentSource[];
  timestamp: string;
}

export interface EnrichCompanyRequest {
  domain?: string;
  companyName?: string;
  sources?: EnrichmentSource[];
}

export interface EnrichCompanyResponse {
  success: boolean;
  data?: {
    companyData: CompanyEnrichmentData;
    sources: EnrichmentSource[];
    confidence: number;
    processingTime: number;
  };
  error?: string;
  message?: string;
}

export interface BatchEnrichRequest {
  cardIds: string[];
  sources?: EnrichmentSource[];
  batchSize?: number;
}

export interface BatchEnrichResponse {
  success: boolean;
  data?: {
    processed: number;
    successful: number;
    failed: number;
    results: EnrichCardResponse[];
  };
  error?: string;
  message?: string;
}

class EnrichmentService {
  private baseUrl = `${API_BASE_URL}/api/v1/enrichment`;

  /**
   * Get authorization headers
   */
  private getAuthHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Check enrichment service health and available sources
   */
  async getHealth(): Promise<EnrichmentHealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      method: 'GET',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get enrichment health');
    }

    return data;
  }

  /**
   * Get available enrichment sources
   */
  async getSources(accessToken: string): Promise<{
    success: boolean;
    data: {
      sources: Array<{
        source: EnrichmentSource;
        enabled: boolean;
        healthy: boolean;
        rateLimit?: {
          remaining: number;
          resetTime: string;
        };
      }>;
    };
  }> {
    const response = await fetch(`${this.baseUrl}/sources`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get enrichment sources');
    }

    return data;
  }

  /**
   * Enrich a specific business card
   */
  async enrichCard(
    request: EnrichCardRequest,
    accessToken: string
  ): Promise<EnrichCardResponse> {
    const response = await fetch(`${this.baseUrl}/card`, {
      method: 'POST',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to enrich card');
    }

    return data;
  }

  /**
   * Enrich company data directly
   */
  async enrichCompany(
    request: EnrichCompanyRequest,
    accessToken: string
  ): Promise<EnrichCompanyResponse> {
    const response = await fetch(`${this.baseUrl}/company`, {
      method: 'POST',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to enrich company');
    }

    return data;
  }

  /**
   * Batch enrich multiple cards
   */
  async batchEnrich(
    request: BatchEnrichRequest,
    accessToken: string
  ): Promise<BatchEnrichResponse> {
    const response = await fetch(`${this.baseUrl}/batch`, {
      method: 'POST',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to batch enrich cards');
    }

    return data;
  }

  /**
   * Get enrichment status for a specific company
   */
  async getCompanyStatus(
    companyId: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    data: {
      companyId: string;
      status: string;
      lastEnrichment?: string;
      sources: EnrichmentSource[];
    };
  }> {
    const response = await fetch(`${this.baseUrl}/company/${companyId}/status`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get company status');
    }

    return data;
  }
}

export default new EnrichmentService();