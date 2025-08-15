import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

import { CardProcessingService } from '../../services/card-processing.service.js';

// Mock the dependencies
jest.mock('../../services/textract.service.js', () => ({
  textractService: {
    extractText: jest.fn(),
    parseBusinessCard: jest.fn(),
  },
}));

jest.mock('../../services/image-preprocessing.service.js', () => ({
  ImagePreprocessingService: {
    processImage: jest.fn(),
  },
}));

jest.mock('../../services/image-validation.service.js', () => ({
  ImageValidationService: {
    validateImage: jest.fn(),
    getConfigForUseCase: jest.fn(() => ({})),
  },
}));

jest.mock('../../services/s3.service.js', () => ({
  s3Service: {
    uploadFile: jest.fn(),
  },
}));

// Mock Prisma
const mockPrisma = {
  card: {
    create: jest.fn(),
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
} as unknown as PrismaClient;

describe('Card Processing Service Tests', () => {
  let cardProcessingService: CardProcessingService;

  beforeEach(() => {
    cardProcessingService = new CardProcessingService(mockPrisma);
    jest.clearAllMocks();
  });

  // Helper to create test images using Sharp
  const createTestImage = async (
    width: number = 400,
    height: number = 300,
    format: 'jpeg' | 'png' = 'jpeg'
  ): Promise<Buffer> => {
    const image = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    });

    if (format === 'jpeg') {
      return image.jpeg().toBuffer();
    } else {
      return image.png().toBuffer();
    }
  };

  describe('Business Card Processing', () => {
    it('should process a business card successfully', async () => {
      const testImageBuffer = await createTestImage(600, 400);
      const userId = 'test-user-id';
      const fileName = 'business-card.jpg';

      // Mock validation
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      // Mock image preprocessing
      const {
        ImagePreprocessingService,
      } = require('../../services/image-preprocessing.service.js');
      ImagePreprocessingService.processImage.mockResolvedValue({
        buffer: testImageBuffer,
        metadata: { processingTime: 100 },
      });

      // Mock S3 upload
      const { s3Service } = require('../../services/s3.service.js');
      s3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.example.com/original.jpg',
        cdnUrl: 'https://cdn.example.com/original.jpg',
      });

      // Mock OCR processing
      const { textractService } = require('../../services/textract.service.js');
      textractService.extractText.mockResolvedValue({
        blocks: [],
        rawText:
          'John Doe\nSoftware Engineer\nTech Corp\njohn.doe@techcorp.com\n+1-555-123-4567\ntechcorp.com\n123 Tech Street, Silicon Valley, CA',
        confidence: 0.91,
        metadata: {
          processingTime: 2500,
          imageSize: { width: 600, height: 400 },
        },
      });

      textractService.parseBusinessCard.mockReturnValue({
        name: { text: 'John Doe', confidence: 0.95 },
        jobTitle: { text: 'Software Engineer', confidence: 0.9 },
        company: { text: 'Tech Corp', confidence: 0.92 },
        email: { text: 'john.doe@techcorp.com', confidence: 0.98 },
        phone: { text: '+1-555-123-4567', confidence: 0.88 },
        website: { text: 'techcorp.com', confidence: 0.85 },
        address: { text: '123 Tech Street, Silicon Valley, CA', confidence: 0.8 },
        rawText:
          'John Doe\nSoftware Engineer\nTech Corp\njohn.doe@techcorp.com\n+1-555-123-4567\ntechcorp.com\n123 Tech Street, Silicon Valley, CA',
        confidence: 0.91,
        metadata: { processingTime: 2500 },
      });

      // Mock database operations
      (mockPrisma.card.findFirst as jest.Mock).mockResolvedValue(null); // No duplicate
      (mockPrisma.card.create as jest.Mock).mockResolvedValue({
        id: 'card-id-123',
        userId,
        name: 'John Doe',
        title: 'Software Engineer',
        company: 'Tech Corp',
        email: 'john.doe@techcorp.com',
        phone: '+15551234567',
        website: 'https://techcorp.com',
        address: '123 Tech Street, Silicon Valley, CA',
      });

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId,
        { saveOriginalImage: true }
      );

      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.cardId).toBe('card-id-123');
      expect(result.data!.extractedData.name?.text).toBe('John Doe');
      expect(result.data!.extractedData.normalizedEmail).toBe('john.doe@techcorp.com');
      expect(result.data!.extractedData.normalizedPhone).toBe('+15551234567');
      expect(result.data!.extractedData.normalizedWebsite).toBe('https://techcorp.com');
      expect(result.data!.confidence).toBe(0.91);
      expect(result.data!.imageUrls.original).toBe('https://cdn.example.com/original.jpg');

      // Verify service calls
      expect(ImageValidationService.validateImage).toHaveBeenCalledWith(
        testImageBuffer,
        fileName,
        {}
      );
      expect(ImagePreprocessingService.processImage).toHaveBeenCalledWith(testImageBuffer, {
        purpose: 'ocr',
        removeMetadata: true,
      });
      expect(s3Service.uploadFile).toHaveBeenCalledWith(testImageBuffer, fileName, {
        userId,
        purpose: 'storage',
      });
      expect(textractService.extractText).toHaveBeenCalled();
      expect(textractService.parseBusinessCard).toHaveBeenCalled();
      expect(mockPrisma.card.create).toHaveBeenCalled();
    });

    it('should handle image validation failure', async () => {
      const testImageBuffer = await createTestImage(50, 50); // Too small
      const userId = 'test-user-id';
      const fileName = 'invalid-card.jpg';

      // Mock validation failure
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: false,
        errors: ['Image too small', 'Invalid aspect ratio'],
        warnings: [],
      });

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_IMAGE');
      expect(result.error?.message).toBe('Image validation failed');
      expect(result.error?.details).toEqual(['Image too small', 'Invalid aspect ratio']);
    });

    it('should handle OCR processing failure', async () => {
      const testImageBuffer = await createTestImage(600, 400);
      const userId = 'test-user-id';
      const fileName = 'unreadable-card.jpg';

      // Mock validation success
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      // Mock image preprocessing
      const {
        ImagePreprocessingService,
      } = require('../../services/image-preprocessing.service.js');
      ImagePreprocessingService.processImage.mockResolvedValue({
        buffer: testImageBuffer,
        metadata: { processingTime: 100 },
      });

      // Mock S3 upload
      const { s3Service } = require('../../services/s3.service.js');
      s3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.example.com/original.jpg',
        cdnUrl: 'https://cdn.example.com/original.jpg',
      });

      // Mock OCR failure
      const { textractService } = require('../../services/textract.service.js');
      textractService.extractText.mockRejectedValue(new Error('OCR service unavailable'));

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_FAILED');
      expect(result.error?.message).toBe('Failed to extract text from business card');
    });

    it('should detect duplicate cards', async () => {
      const testImageBuffer = await createTestImage(600, 400);
      const userId = 'test-user-id';
      const fileName = 'duplicate-card.jpg';

      // Mock validation and preprocessing
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const {
        ImagePreprocessingService,
      } = require('../../services/image-preprocessing.service.js');
      ImagePreprocessingService.processImage.mockResolvedValue({
        buffer: testImageBuffer,
        metadata: { processingTime: 100 },
      });

      const { s3Service } = require('../../services/s3.service.js');
      s3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.example.com/original.jpg',
        cdnUrl: 'https://cdn.example.com/original.jpg',
      });

      // Mock OCR processing
      const { TextractService } = require('../../services/textract.service.js');
      TextractService.processBusinessCard.mockResolvedValue({
        success: true,
        data: {
          businessCardData: {
            name: { text: 'Jane Smith', confidence: 0.95 },
            email: { text: 'jane.smith@company.com', confidence: 0.98 },
            rawText: 'Jane Smith\njane.smith@company.com',
            confidence: 0.91,
          },
          ocrResult: { blocks: [], rawText: 'Jane Smith' },
        },
      });

      // Mock duplicate detection
      (mockPrisma.card.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-card-id',
      });

      // Mock new card creation
      (mockPrisma.card.create as jest.Mock).mockResolvedValue({
        id: 'new-card-id',
        userId,
        name: 'Jane Smith',
        email: 'jane.smith@company.com',
      });

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId
      );

      expect(result.success).toBe(true);
      expect(result.data!.duplicateCardId).toBe('existing-card-id');
    });

    it('should skip duplicate check when requested', async () => {
      const testImageBuffer = await createTestImage(600, 400);
      const userId = 'test-user-id';
      const fileName = 'business-card.jpg';

      // Mock all services
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const {
        ImagePreprocessingService,
      } = require('../../services/image-preprocessing.service.js');
      ImagePreprocessingService.processImage.mockResolvedValue({
        buffer: testImageBuffer,
        metadata: { processingTime: 100 },
      });

      const { s3Service } = require('../../services/s3.service.js');
      s3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.example.com/original.jpg',
        cdnUrl: 'https://cdn.example.com/original.jpg',
      });

      const { TextractService } = require('../../services/textract.service.js');
      TextractService.processBusinessCard.mockResolvedValue({
        success: true,
        data: {
          businessCardData: {
            name: { text: 'Test User', confidence: 0.95 },
            rawText: 'Test User',
            confidence: 0.91,
          },
          ocrResult: { blocks: [], rawText: 'Test User' },
        },
      });

      (mockPrisma.card.create as jest.Mock).mockResolvedValue({
        id: 'new-card-id',
        userId,
        name: 'Test User',
      });

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId,
        { skipDuplicateCheck: true }
      );

      expect(result.success).toBe(true);
      expect(result.data!.duplicateCardId).toBeUndefined();
      expect(mockPrisma.card.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Data Normalization', () => {
    it('should normalize phone numbers correctly', async () => {
      const service = cardProcessingService as any; // Access private methods for testing

      expect(service.normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('+1-555-123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('1-555-123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
    });

    it('should normalize email addresses correctly', async () => {
      const service = cardProcessingService as any; // Access private methods for testing

      expect(service.normalizeEmail('JOHN.DOE@COMPANY.COM')).toBe('john.doe@company.com');
      expect(service.normalizeEmail('  jane@example.org  ')).toBe('jane@example.org');
      expect(service.normalizeEmail('Test.User@Domain.Net')).toBe('test.user@domain.net');
    });

    it('should normalize website URLs correctly', async () => {
      const service = cardProcessingService as any; // Access private methods for testing

      expect(service.normalizeWebsite('company.com')).toBe('https://company.com');
      expect(service.normalizeWebsite('www.example.org')).toBe('https://www.example.org');
      expect(service.normalizeWebsite('https://domain.com/')).toBe('https://domain.com');
      expect(service.normalizeWebsite('HTTP://EXAMPLE.COM')).toBe('http://example.com');
    });
  });

  describe('Processing Statistics', () => {
    it('should return user processing statistics', async () => {
      const userId = 'test-user-id';

      // Mock database aggregation
      (mockPrisma.card.aggregate as jest.Mock).mockResolvedValue({
        _count: { id: 25 },
        _avg: { confidence: 0.89 },
      });

      (mockPrisma.card.findFirst as jest.Mock).mockResolvedValue({
        scanDate: new Date('2025-08-01'),
      });

      const stats = await cardProcessingService.getProcessingStats(userId);

      expect(stats).toEqual({
        totalCards: 25,
        averageConfidence: 0.89,
        processingSuccessRate: 0.95,
        duplicatesFound: 0,
        mostRecentScan: new Date('2025-08-01'),
      });

      expect(mockPrisma.card.aggregate).toHaveBeenCalledWith({
        where: { userId },
        _count: { id: true },
        _avg: { confidence: true },
      });
    });

    it('should handle empty statistics gracefully', async () => {
      const userId = 'new-user-id';

      // Mock empty results
      (mockPrisma.card.aggregate as jest.Mock).mockResolvedValue({
        _count: { id: 0 },
        _avg: { confidence: null },
      });

      (mockPrisma.card.findFirst as jest.Mock).mockResolvedValue(null);

      const stats = await cardProcessingService.getProcessingStats(userId);

      expect(stats).toEqual({
        totalCards: 0,
        averageConfidence: 0,
        processingSuccessRate: 0.95,
        duplicatesFound: 0,
        mostRecentScan: undefined,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const testImageBuffer = await createTestImage(600, 400);
      const userId = 'test-user-id';
      const fileName = 'business-card.jpg';

      // Mock validation and services to succeed
      const { ImageValidationService } = require('../../services/image-validation.service.js');
      ImageValidationService.validateImage.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const {
        ImagePreprocessingService,
      } = require('../../services/image-preprocessing.service.js');
      ImagePreprocessingService.processImage.mockResolvedValue({
        buffer: testImageBuffer,
        metadata: { processingTime: 100 },
      });

      const { s3Service } = require('../../services/s3.service.js');
      s3Service.uploadFile.mockResolvedValue({
        url: 'https://s3.example.com/original.jpg',
      });

      const { TextractService } = require('../../services/textract.service.js');
      TextractService.processBusinessCard.mockResolvedValue({
        success: true,
        data: {
          businessCardData: {
            name: { text: 'Test User', confidence: 0.95 },
            rawText: 'Test User',
            confidence: 0.91,
          },
          ocrResult: { blocks: [], rawText: 'Test User' },
        },
      });

      // Mock database error
      (mockPrisma.card.create as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await cardProcessingService.processBusinessCard(
        testImageBuffer,
        fileName,
        userId
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROCESSING_FAILED');
      expect(result.error?.message).toBe('Failed to process business card');
    });
  });
});
