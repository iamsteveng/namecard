import type { BusinessCardData } from '@namecard/shared';
import { PrismaClient } from '@prisma/client';

import logger from '../utils/logger.js';

import { ImagePreprocessingService } from './image-preprocessing.service.js';
import { ImageValidationService } from './image-validation.service.js';
import { s3Service } from './s3.service.js';
import { textractService, OCRResult } from './textract.service.js';

export interface CardProcessingOptions {
  skipImageProcessing?: boolean;
  skipOCR?: boolean;
  skipDuplicateCheck?: boolean;
  saveOriginalImage?: boolean;
  saveProcessedImage?: boolean;
  ocrOptions?: {
    minConfidence?: number;
    useAnalyzeDocument?: boolean;
    enhanceImage?: boolean;
  };
}

export interface CardProcessingResult {
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
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export class CardProcessingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process a business card image end-to-end
   */
  async processBusinessCard(
    imageBuffer: Buffer,
    fileName: string,
    userId: string,
    options: CardProcessingOptions = {}
  ): Promise<CardProcessingResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting business card processing', {
        userId,
        fileName,
        fileSize: imageBuffer.length,
        options,
      });

      // Step 1: Validate the image
      const validationResult = await ImageValidationService.validateImage(
        imageBuffer,
        fileName,
        ImageValidationService.getConfigForUseCase('business-card')
      );

      if (!validationResult.isValid) {
        return {
          success: false,
          error: {
            code: 'INVALID_IMAGE',
            message: 'Image validation failed',
            details: validationResult.errors,
          },
        };
      }

      // Step 2: Image preprocessing for OCR
      let processedImageBuffer = imageBuffer;
      let processedImageUrl: string | undefined;

      if (!options.skipImageProcessing) {
        const preprocessingResult = await ImagePreprocessingService.processImage(imageBuffer, {
          purpose: 'ocr',
          removeMetadata: true,
        });
        processedImageBuffer = preprocessingResult.buffer;

        // Upload processed image to S3 if requested
        if (options.saveProcessedImage) {
          const s3Result = await s3Service.uploadFile(
            processedImageBuffer,
            `processed_${fileName}`,
            { userId, purpose: 'ocr' }
          );
          processedImageUrl = (s3Result as any).cdnUrl || s3Result.url;
        }
      }

      // Step 3: Upload original image to S3
      let originalImageUrl: string | undefined;
      if (options.saveOriginalImage !== false) {
        const s3Result = await s3Service.uploadFile(imageBuffer, fileName, {
          userId,
          purpose: 'storage',
        });
        originalImageUrl = (s3Result as any).cdnUrl || s3Result.url;
      }

      // Step 4: OCR Processing
      let ocrResult: OCRResult | undefined;
      let businessCardData: BusinessCardData | undefined;

      if (!options.skipOCR) {
        try {
          ocrResult = await textractService.extractText(
            processedImageBuffer,
            'image/jpeg' // Processed images are always JPEG
          );

          if (ocrResult) {
            businessCardData = textractService.parseBusinessCard(ocrResult);
          }
        } catch (error) {
          logger.error('OCR processing failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId,
            fileName,
          });

          return {
            success: false,
            error: {
              code: 'OCR_FAILED',
              message: 'Failed to extract text from business card',
              details: error instanceof Error ? error.message : 'Unknown error',
            },
          };
        }
      }

      if (!businessCardData) {
        return {
          success: false,
          error: {
            code: 'NO_DATA_EXTRACTED',
            message: 'No business card data could be extracted from the image',
          },
        };
      }

      // Step 5: Data normalization
      const normalizedData = await this.normalizeBusinessCardData(businessCardData);

      // Step 6: Duplicate detection
      let duplicateCardId: string | undefined;
      if (!options.skipDuplicateCheck) {
        duplicateCardId = await this.findDuplicateCard(userId, normalizedData);
      }

      // Step 7: Save to database
      const cardId = await this.saveCardToDatabase(userId, normalizedData, {
        originalImageUrl: originalImageUrl || '',
        processedImageUrl,
        extractedText: businessCardData.rawText,
        confidence: businessCardData.confidence,
        ocrMetadata: ocrResult,
      });

      const processingTime = Date.now() - startTime;

      logger.info('Business card processing completed', {
        cardId,
        userId,
        processingTime,
        duplicateFound: !!duplicateCardId,
        confidence: businessCardData.confidence,
      });

      return {
        success: true,
        data: {
          cardId,
          extractedData: normalizedData,
          confidence: businessCardData.confidence,
          duplicateCardId,
          imageUrls: {
            original: originalImageUrl,
            processed: processedImageUrl,
          },
          processingTime,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Business card processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        fileName,
        processingTime,
      });

      return {
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: 'Failed to process business card',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Normalize and clean extracted business card data
   */
  private async normalizeBusinessCardData(data: BusinessCardData): Promise<
    BusinessCardData & {
      normalizedPhone?: string;
      normalizedEmail?: string;
      normalizedWebsite?: string;
    }
  > {
    const normalized = { ...data } as BusinessCardData & {
      normalizedPhone?: string;
      normalizedEmail?: string;
      normalizedWebsite?: string;
    };

    // Normalize phone number
    if (data.phone?.text) {
      normalized.normalizedPhone = this.normalizePhoneNumber(data.phone.text);
    }

    // Normalize email
    if (data.email?.text) {
      normalized.normalizedEmail = this.normalizeEmail(data.email.text);
    }

    // Normalize website
    if (data.website?.text) {
      normalized.normalizedWebsite = this.normalizeWebsite(data.website.text);
    }

    return normalized;
  }

  /**
   * Find potential duplicate cards for the same user
   */
  private async findDuplicateCard(
    userId: string,
    data: BusinessCardData & {
      normalizedPhone?: string;
      normalizedEmail?: string;
      normalizedWebsite?: string;
    }
  ): Promise<string | undefined> {
    try {
      // Check for duplicates based on email or phone
      const duplicateConditions = [];

      if (data.normalizedEmail) {
        duplicateConditions.push({ email: data.normalizedEmail });
      }

      if (data.normalizedPhone) {
        duplicateConditions.push({ phone: data.normalizedPhone });
      }

      if (data.name?.text && data.company?.text) {
        duplicateConditions.push({
          name: data.name.text,
          company: data.company.text,
        });
      }

      if (duplicateConditions.length === 0) {
        return undefined;
      }

      const duplicateCard = await this.prisma.card.findFirst({
        where: {
          userId,
          OR: duplicateConditions,
        },
        select: { id: true },
      });

      return duplicateCard?.id;
    } catch (error) {
      logger.warn('Duplicate detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return undefined;
    }
  }

  /**
   * Save processed card data to database
   */
  private async saveCardToDatabase(
    userId: string,
    data: BusinessCardData & {
      normalizedPhone?: string;
      normalizedEmail?: string;
      normalizedWebsite?: string;
    },
    metadata: {
      originalImageUrl: string;
      processedImageUrl?: string;
      extractedText: string;
      confidence: number;
      ocrMetadata?: any;
    }
  ): Promise<string> {
    const card = await this.prisma.card.create({
      data: {
        userId,
        originalImageUrl: metadata.originalImageUrl,
        processedImageUrl: metadata.processedImageUrl,
        extractedText: metadata.extractedText,
        confidence: metadata.confidence,
        name: data.name?.text,
        title: data.jobTitle?.text,
        company: data.company?.text,
        email: data.normalizedEmail || data.email?.text,
        phone: data.normalizedPhone || data.phone?.text,
        website: data.normalizedWebsite || data.website?.text,
        address: data.address?.text,
        scanDate: new Date(),
        tags: [],
      },
    });

    return card.id;
  }

  /**
   * Normalize phone number to E.164 format or clean format
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except + at the beginning
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Handle common formats
    if (cleaned.startsWith('+')) {
      return cleaned;
    } else if (cleaned.length === 10) {
      // Assume US number if 10 digits
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // US number with country code
      return `+${cleaned}`;
    }

    // Return cleaned version if we can't determine format
    return cleaned;
  }

  /**
   * Normalize email address
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Normalize website URL
   */
  private normalizeWebsite(website: string): string {
    let normalized = website.toLowerCase().trim();

    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }

    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Get card processing statistics for a user
   */
  async getProcessingStats(userId: string): Promise<{
    totalCards: number;
    averageConfidence: number;
    processingSuccessRate: number;
    duplicatesFound: number;
    mostRecentScan?: Date;
  }> {
    const stats = await this.prisma.card.aggregate({
      where: { userId },
      _count: { id: true },
      _avg: { confidence: true },
    });

    const mostRecent = await this.prisma.card.findFirst({
      where: { userId },
      orderBy: { scanDate: 'desc' },
      select: { scanDate: true },
    });

    const rawConfidence = stats._avg.confidence || 0;
    // Ensure confidence is in decimal format (0.0-1.0)
    // If stored as percentage (>1), convert to decimal
    const averageConfidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

    return {
      totalCards: stats._count.id || 0,
      averageConfidence,
      processingSuccessRate: 0.95, // This would be calculated from processing logs
      duplicatesFound: 0, // This would be calculated from duplicate detection logs
      mostRecentScan: mostRecent?.scanDate || undefined,
    };
  }
}

// Export singleton instance
export const cardProcessingService = new CardProcessingService(
  // This will be injected from the route handler
  {} as PrismaClient
);
