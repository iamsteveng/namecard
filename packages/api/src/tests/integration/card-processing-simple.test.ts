import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

import { CardProcessingService } from '../../services/card-processing.service.js';

// Mock all the dependencies
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

describe('Card Processing Service - Integration Tests', () => {
  let cardProcessingService: CardProcessingService;

  beforeEach(() => {
    cardProcessingService = new CardProcessingService(mockPrisma);
    jest.clearAllMocks();
  });

  const createTestImage = async (): Promise<Buffer> => {
    return sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
  };

  it('should process a business card successfully', async () => {
    const testImageBuffer = await createTestImage();
    const userId = 'test-user-id';
    const fileName = 'business-card.jpg';

    // Set up all mocks
    const { ImageValidationService } = require('../../services/image-validation.service.js');
    const { ImagePreprocessingService } = require('../../services/image-preprocessing.service.js');
    const { s3Service } = require('../../services/s3.service.js');
    const { textractService } = require('../../services/textract.service.js');

    ImageValidationService.validateImage.mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    ImagePreprocessingService.processImage.mockResolvedValue({
      buffer: testImageBuffer,
      metadata: { processingTime: 100 },
    });

    s3Service.uploadFile.mockResolvedValue({
      url: 'https://s3.example.com/original.jpg',
      cdnUrl: 'https://cdn.example.com/original.jpg',
    });

    textractService.extractText.mockResolvedValue({
      blocks: [],
      rawText: 'John Doe\\nSoftware Engineer\\nTech Corp\\njohn.doe@techcorp.com',
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
      rawText: 'John Doe\\nSoftware Engineer\\nTech Corp\\njohn.doe@techcorp.com',
      confidence: 0.91,
    });

    (mockPrisma.card.findFirst as jest.Mock).mockResolvedValue(null); // No duplicate
    (mockPrisma.card.create as jest.Mock).mockResolvedValue({
      id: 'card-id-123',
      userId,
      name: 'John Doe',
      email: 'john.doe@techcorp.com',
      scanDate: new Date(),
    });

    // Execute
    const result = await cardProcessingService.processBusinessCard(
      testImageBuffer,
      fileName,
      userId,
      { saveOriginalImage: true }
    );

    // Verify
    expect(result.success).toBe(true);
    expect(result.data?.cardId).toBe('card-id-123');
    expect(result.data?.extractedData.name?.text).toBe('John Doe');
    expect(textractService.extractText).toHaveBeenCalled();
    expect(textractService.parseBusinessCard).toHaveBeenCalled();
    expect(mockPrisma.card.create).toHaveBeenCalled();
  });

  it('should handle validation failure', async () => {
    const testImageBuffer = await createTestImage();
    const { ImageValidationService } = require('../../services/image-validation.service.js');

    ImageValidationService.validateImage.mockResolvedValue({
      isValid: false,
      errors: ['Image too small'],
      warnings: [],
    });

    const result = await cardProcessingService.processBusinessCard(
      testImageBuffer,
      'invalid.jpg',
      'test-user-id'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_IMAGE');
  });

  it('should handle OCR failure', async () => {
    const testImageBuffer = await createTestImage();
    const { ImageValidationService } = require('../../services/image-validation.service.js');
    const { ImagePreprocessingService } = require('../../services/image-preprocessing.service.js');
    const { textractService } = require('../../services/textract.service.js');

    ImageValidationService.validateImage.mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    ImagePreprocessingService.processImage.mockResolvedValue({
      buffer: testImageBuffer,
      metadata: { processingTime: 100 },
    });

    textractService.extractText.mockRejectedValue(new Error('OCR service unavailable'));

    const result = await cardProcessingService.processBusinessCard(
      testImageBuffer,
      'ocr-fail.jpg',
      'test-user-id'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('OCR_FAILED');
  });
});
