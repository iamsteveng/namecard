import type {
  Card,
  CreateCardData,
  UpdateCardData,
  CardFilters,
  CardSearchParams,
  CardExportRequest,
  CardExportResponse,
} from '@namecard/shared/types/card.types';
import type { BusinessCardData } from '@namecard/shared/types/textract.types';

import { buildV1Url } from '../config/api';

interface CardListResponse {
  success: boolean;
  data: {
    cards: Card[];
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

interface UploadResponse {
  success: boolean;
  data: {
    files: Array<{
      key: string;
      url: string;
      variants: {
        original: string;
        ocr: string;
        thumbnail: string;
        web: string;
      };
    }>;
  };
  error?: string;
}

class CardService {
  private baseUrl = buildV1Url('');

  private getAuthHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upload and process business card image
   */
  async uploadAndProcessCard(
    file: File,
    accessToken: string
  ): Promise<{ imageData: UploadResponse['data']; ocrData: BusinessCardData }> {
    // First, upload the image
    const formData = new FormData();
    formData.append('image', file);

    const uploadResponse = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(uploadData.error?.message || uploadData.message || 'Upload failed');
    }

    // Then, process with OCR using the OCR variant URL
    const ocrImageUrl = uploadData.data.files[0].variants.ocr;

    // Convert URL to blob for OCR processing
    const imageResponse = await fetch(ocrImageUrl);
    const imageBlob = await imageResponse.blob();

    const ocrFormData = new FormData();
    ocrFormData.append('image', imageBlob);

    const ocrResponse = await fetch(`${this.baseUrl}/scan/business-card`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: ocrFormData,
    });

    const ocrData = await ocrResponse.json();

    if (!ocrResponse.ok) {
      throw new Error(ocrData.error?.message || ocrData.message || 'OCR processing failed');
    }

    return {
      imageData: uploadData.data,
      ocrData: ocrData.data.businessCardData,
    };
  }

  /**
   * Create a new business card from validated data
   */
  async createCard(cardData: Omit<CreateCardData, 'userId'>, accessToken: string): Promise<Card> {
    const response = await fetch(`${this.baseUrl}/cards`, {
      method: 'POST',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(cardData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to create card');
    }

    return data.data;
  }

  /**
   * Get all cards for the user
   */
  async getCards(
    accessToken: string,
    page = 1,
    limit = 20,
    filters?: CardFilters
  ): Promise<CardListResponse['data']> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else if (typeof value === 'boolean') {
            params.append(key, value.toString());
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    const response = await fetch(`${this.baseUrl}/cards?${params}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to fetch cards');
    }

    return data.data;
  }

  /**
   * Get a single card by ID
   */
  async getCard(cardId: string, accessToken: string): Promise<Card> {
    const response = await fetch(`${this.baseUrl}/cards/${cardId}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to fetch card');
    }

    return data.data;
  }

  /**
   * Update a business card
   */
  async updateCard(cardId: string, updates: UpdateCardData, accessToken: string): Promise<Card> {
    const response = await fetch(`${this.baseUrl}/cards/${cardId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to update card');
    }

    return data.data;
  }

  /**
   * Delete a business card
   */
  async deleteCard(cardId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/cards/${cardId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(accessToken),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || data.message || 'Failed to delete card');
    }
  }

  /**
   * Search cards
   */
  async searchCards(
    searchParams: CardSearchParams,
    accessToken: string
  ): Promise<CardListResponse['data']> {
    const params = new URLSearchParams();

    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else if (typeof value === 'boolean') {
          params.append(key, value.toString());
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const response = await fetch(`${this.baseUrl}/cards/search?${params}`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Search failed');
    }

    return data.data;
  }

  /**
   * Get available tags
   */
  async getTags(accessToken: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/cards/tags`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to fetch tags');
    }

    return data.data.tags;
  }

  /**
   * Get companies from cards
   */
  async getCompanies(accessToken: string): Promise<Array<{ name: string; count: number }>> {
    const response = await fetch(`${this.baseUrl}/cards/companies`, {
      method: 'GET',
      headers: this.getAuthHeaders(accessToken),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to fetch companies');
    }

    return data.data.companies;
  }

  /**
   * Export cards
   */
  async exportCards(
    exportRequest: CardExportRequest,
    accessToken: string
  ): Promise<CardExportResponse> {
    const response = await fetch(`${this.baseUrl}/cards/export`, {
      method: 'POST',
      headers: this.getAuthHeaders(accessToken),
      body: JSON.stringify(exportRequest),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Export failed');
    }

    return data.data;
  }

  /**
   * Complete workflow: Upload image, process OCR, and create card
   */
  async scanAndSaveCard(
    file: File,
    validatedData: Omit<
      CreateCardData,
      'userId' | 'originalImageUrl' | 'extractedText' | 'confidence' | 'scanDate'
    >,
    accessToken: string
  ): Promise<Card> {
    try {
      // Step 1: Upload and process the image
      const { imageData, ocrData } = await this.uploadAndProcessCard(file, accessToken);

      // Step 2: Create card with validated data
      const cardData: Omit<CreateCardData, 'userId'> = {
        originalImageUrl: imageData.files[0]?.variants.original || imageData.files[0]?.url || '',
        extractedText: ocrData.rawText,
        confidence: ocrData.confidence,
        scanDate: new Date(),
        ...validatedData,
      };

      // Step 3: Save to database
      const savedCard = await this.createCard(cardData, accessToken);

      return savedCard;
    } catch (error) {
      throw new Error(
        `Failed to scan and save card: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export default new CardService();
