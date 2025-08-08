import type { BusinessCardData } from '@namecard/shared';
import type { BusinessCardEnrichmentData } from '@namecard/shared/types/enrichment.types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export interface ScanCardOptions {
  minConfidence?: number;
  saveOriginalImage?: boolean;
  saveProcessedImage?: boolean;
  skipDuplicateCheck?: boolean;
  useAnalyzeDocument?: boolean;
  enhanceImage?: boolean;
}

export interface ScanCardResponse {
  success: boolean;
  data?: {
    cardId: string;
    extractedData: BusinessCardData & {
      normalizedPhone?: string;
      normalizedEmail?: string;
      normalizedWebsite?: string;
    };
    confidence: number;
    duplicateCardId?: string;
    imageUrls: {
      original?: string;
      processed?: string;
    };
    processingTime: number;
  };
  error?: string;
  details?: any;
  message?: string;
}

export interface Card {
  id: string;
  userId: string;
  originalImageUrl?: string;
  processedImageUrl?: string;
  extractedText: string;
  confidence: number;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  tags: string[];
  scanDate: string;
  createdAt: string;
  updatedAt: string;
  lastEnrichmentDate?: string;
  // Enriched data - companies come through junction table
  companies?: Array<{
    cardId?: string;
    companyId?: string;
    company?: {
      id: string;
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      headquarters?: string;
      website?: string;
      description?: string;
      logoUrl?: string;
      founded?: number;
      employeeCount?: number;
      annualRevenue?: string;
      funding?: string;
      technologies?: string[];
      keywords?: string[];
      linkedinUrl?: string;
      twitterHandle?: string;
      facebookUrl?: string;
      overallEnrichmentScore?: number;
      lastEnrichmentDate?: string;
    };
  } | {
    // Or directly as company data (fallback)
    id: string;
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    headquarters?: string;
    website?: string;
    description?: string;
    logoUrl?: string;
    founded?: number;
    employeeCount?: number;
    annualRevenue?: string;
    funding?: string;
    technologies?: string[];
    keywords?: string[];
    linkedinUrl?: string;
    twitterHandle?: string;
    facebookUrl?: string;
    overallEnrichmentScore?: number;
    lastEnrichmentDate?: string;
  }>;
  enrichments?: Array<{
    id: string;
    enrichmentType: string;
    status: string;
    companiesFound: number;
    dataPointsAdded: number;
    confidence: number;
    enrichedAt?: string;
    errorMessage?: string;
  }>;
  calendarEvents?: Array<{
    id: string;
    title: string;
    eventDate?: string;
    location?: string;
    attendees: string[];
    source: string;
  }>;
  // Full enrichment data from API
  enrichmentData?: BusinessCardEnrichmentData;
}

export interface GetCardsResponse {
  success: boolean;
  data: {
    cards: Card[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    filters: any;
  };
}

export interface GetCardResponse {
  success: boolean;
  data: {
    card: Card;
  };
}

export interface UpdateCardData {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

export interface ProcessingStats {
  totalCards: number;
  averageConfidence: number;
  processingSuccessRate: number;
  duplicatesFound: number;
  mostRecentScan?: string;
}

export interface GetStatsResponse {
  success: boolean;
  data: {
    stats: ProcessingStats;
  };
}

class CardsService {
  private baseUrl = `${API_BASE_URL}/api/v1/cards`;

  /**
   * Get authorization headers
   */
  private getAuthHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // File upload headers are set inline in the XMLHttpRequest

  /**
   * Scan business card image
   */
  async scanCard(
    file: File,
    accessToken: string,
    options: ScanCardOptions = {},
    onProgress?: (progress: number) => void
  ): Promise<ScanCardResponse> {
    const formData = new FormData();
    formData.append('image', file);
    
    // Add options as form fields
    if (options.minConfidence !== undefined) {
      formData.append('minConfidence', options.minConfidence.toString());
    }
    if (options.saveOriginalImage !== undefined) {
      formData.append('saveOriginalImage', options.saveOriginalImage.toString());
    }
    if (options.saveProcessedImage !== undefined) {
      formData.append('saveProcessedImage', options.saveProcessedImage.toString());
    }
    if (options.skipDuplicateCheck !== undefined) {
      formData.append('skipDuplicateCheck', options.skipDuplicateCheck.toString());
    }
    if (options.useAnalyzeDocument !== undefined) {
      formData.append('useAnalyzeDocument', options.useAnalyzeDocument.toString());
    }
    if (options.enhanceImage !== undefined) {
      formData.append('enhanceImage', options.enhanceImage.toString());
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || data.message || 'Scan failed'));
          }
        } catch (error) {
          reject(new Error('Invalid response from server'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during scan'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Scan request timed out'));
      });

      xhr.open('POST', `${this.baseUrl}/scan`);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.timeout = 60000; // 60 second timeout for OCR processing
      xhr.send(formData);
    });
  }

  /**
   * Get user's cards with pagination and filtering
   */
  async getCards(
    accessToken: string,
    params: {
      page?: number;
      limit?: number;
      sort?: 'asc' | 'desc';
      sortBy?: string;
      q?: string;
      company?: string;
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ): Promise<GetCardsResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });

    const response = await fetch(`${this.baseUrl}?${searchParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get cards');
    }

    return data;
  }

  /**
   * Get specific card by ID
   */
  async getCard(cardId: string, accessToken: string): Promise<GetCardResponse> {
    const response = await fetch(`${this.baseUrl}/${cardId}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get card');
    }

    return data;
  }

  /**
   * Update card information
   */
  async updateCard(
    cardId: string,
    updates: UpdateCardData,
    accessToken: string
  ): Promise<GetCardResponse> {
    const response = await fetch(`${this.baseUrl}/${cardId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to update card');
    }

    return data;
  }

  /**
   * Delete card
   */
  async deleteCard(cardId: string, accessToken: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/${cardId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to delete card');
    }

    return data;
  }

  /**
   * Get processing statistics
   */
  async getStats(accessToken: string): Promise<GetStatsResponse> {
    const response = await fetch(`${this.baseUrl}/stats`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get stats');
    }

    return data;
  }

  /**
   * Search cards
   */
  async searchCards(
    query: string,
    accessToken: string,
    filters: {
      company?: string;
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<GetCardsResponse> {
    const searchParams = new URLSearchParams({ q: query });
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });

    const response = await fetch(`${this.baseUrl}/search?${searchParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to search cards');
    }

    return data;
  }

  /**
   * Get available tags
   */
  async getTags(accessToken: string): Promise<{ success: boolean; data: { tags: Array<{ name: string; count: number }> } }> {
    const response = await fetch(`${this.baseUrl}/tags`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get tags');
    }

    return data;
  }

  /**
   * Get companies list
   */
  async getCompanies(accessToken: string): Promise<{ 
    success: boolean; 
    data: { 
      companies: Array<{ 
        id?: string; 
        name: string; 
        industry?: string; 
        cardCount: number; 
        isRegistered: boolean 
      }> 
    } 
  }> {
    const response = await fetch(`${this.baseUrl}/companies`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get companies');
    }

    return data;
  }
}

export default new CardsService();