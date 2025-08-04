import request from 'supertest';
import { app } from '../../app.js';
import sharp from 'sharp';

// Mock the card processing service
jest.mock('../../services/card-processing.service.js', () => ({
  CardProcessingService: jest.fn().mockImplementation(() => ({
    processBusinessCard: jest.fn(),
    getProcessingStats: jest.fn(),
  })),
}));

// Mock authentication middleware
jest.mock('../../middleware/auth.middleware.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  },
  AuthenticatedRequest: {},
}));

describe('Cards Routes Integration Tests', () => {
  // Helper to create test images using Sharp
  const createTestImage = async (
    width: number = 600,
    height: number = 400,
    format: 'jpeg' | 'png' = 'jpeg'
  ): Promise<Buffer> => {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .format(format)
      .toBuffer();
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/cards/scan', () => {
    it('should process a business card image successfully', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'card-123',
          extractedData: {
            name: { text: 'John Doe', confidence: 0.95 },
            jobTitle: { text: 'Software Engineer', confidence: 0.90 },
            company: { text: 'Tech Corp', confidence: 0.92 },
            email: { text: 'john.doe@techcorp.com', confidence: 0.98 },
            phone: { text: '+1-555-123-4567', confidence: 0.88 },
            rawText: 'John Doe\\nSoftware Engineer\\nTech Corp',
            confidence: 0.91,
            normalizedEmail: 'john.doe@techcorp.com',
            normalizedPhone: '+15551234567',
          },
          confidence: 0.91,
          imageUrls: {
            original: 'https://cdn.example.com/original.jpg',
          },
          processingTime: 2500,
        },
      });

      const testImage = await createTestImage();

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'business-card.jpg')
        .field('minConfidence', '0.8')
        .field('saveOriginalImage', 'true')
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          cardId: 'card-123',
          extractedData: {
            name: { text: 'John Doe', confidence: 0.95 },
            normalizedEmail: 'john.doe@techcorp.com',
          },
          confidence: 0.91,
        },
        message: 'Business card processed successfully',
      });

      expect(mockProcessBusinessCard).toHaveBeenCalledWith(
        expect.any(Buffer),
        'business-card.jpg',
        'test-user-id',
        expect.objectContaining({
          saveOriginalImage: true,
          ocrOptions: {
            minConfidence: 0.8,
            useAnalyzeDocument: true,
            enhanceImage: true,
          },
        })
      );
    });

    it('should handle duplicate card detection', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'card-456',
          extractedData: {
            name: { text: 'Jane Smith', confidence: 0.95 },
            email: { text: 'jane@company.com', confidence: 0.98 },
            rawText: 'Jane Smith\\njane@company.com',
            confidence: 0.93,
          },
          confidence: 0.93,
          duplicateCardId: 'existing-card-123',
          imageUrls: {
            original: 'https://cdn.example.com/duplicate.jpg',
          },
          processingTime: 1800,
        },
      });

      const testImage = await createTestImage();

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'duplicate-card.jpg')
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          duplicateCardId: 'existing-card-123',
        },
        message: 'Business card processed successfully. Duplicate card detected.',
      });
    });

    it('should require authentication', async () => {
      // Temporarily override the mock to simulate authentication failure
      const originalAuth = require('../../middleware/auth.middleware.js').authenticateToken;
      require('../../middleware/auth.middleware.js').authenticateToken = (req: any, res: any, next: any) => {
        res.status(401).json({ success: false, error: 'Unauthorized' });
      };

      const testImage = await createTestImage();

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'test.jpg')
        .expect(401);

      // Restore original mock
      require('../../middleware/auth.middleware.js').authenticateToken = originalAuth;
    });

    it('should reject requests without image file', async () => {
      const response = await request(app)
        .post('/api/v1/cards/scan')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'No image file provided',
      });
    });

    it('should reject invalid file types', async () => {
      const textBuffer = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', textBuffer, 'document.txt')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid file type'),
      });
    });

    it('should handle processing failures', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: false,
        error: {
          code: 'OCR_FAILED',
          message: 'Failed to extract text from business card',
          details: 'OCR service unavailable',
        },
      });

      const testImage = await createTestImage();

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'unreadable.jpg')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to extract text from business card',
        details: {
          code: 'OCR_FAILED',
          message: 'Failed to extract text from business card',
        },
      });
    });
  });

  describe('GET /api/v1/cards/stats', () => {
    it('should return user processing statistics', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockGetProcessingStats = CardProcessingService.mock.instances[0].getProcessingStats;

      mockGetProcessingStats.mockResolvedValue({
        totalCards: 15,
        averageConfidence: 0.87,
        processingSuccessRate: 0.93,
        duplicatesFound: 2,
        mostRecentScan: new Date('2025-08-04T10:00:00Z'),
      });

      const response = await request(app)
        .get('/api/v1/cards/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          stats: {
            totalCards: 15,
            averageConfidence: 0.87,
            processingSuccessRate: 0.93,
            duplicatesFound: 2,
            mostRecentScan: '2025-08-04T10:00:00.000Z',
          },
        },
      });

      expect(mockGetProcessingStats).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle statistics service errors', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockGetProcessingStats = CardProcessingService.mock.instances[0].getProcessingStats;

      mockGetProcessingStats.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/cards/stats')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('Processing Options', () => {
    it('should respect skipDuplicateCheck option', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'card-789',
          extractedData: {
            name: { text: 'Bob Wilson', confidence: 0.92 },
            rawText: 'Bob Wilson',
            confidence: 0.92,
          },
          confidence: 0.92,
          imageUrls: {
            original: 'https://cdn.example.com/bob.jpg',
          },
          processingTime: 2100,
        },
      });

      const testImage = await createTestImage();

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'unique-card.jpg')
        .field('skipDuplicateCheck', 'true')
        .expect(201);

      expect(mockProcessBusinessCard).toHaveBeenCalledWith(
        expect.any(Buffer),
        'unique-card.jpg',
        'test-user-id',
        expect.objectContaining({
          skipDuplicateCheck: true,
        })
      );
    });

    it('should respect saveProcessedImage option', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'card-101',
          extractedData: {
            name: { text: 'Alice Johnson', confidence: 0.88 },
            rawText: 'Alice Johnson',
            confidence: 0.88,
          },
          confidence: 0.88,
          imageUrls: {
            original: 'https://cdn.example.com/alice-original.jpg',
            processed: 'https://cdn.example.com/alice-processed.jpg',
          },
          processingTime: 2800,
        },
      });

      const testImage = await createTestImage();

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'processed-card.jpg')
        .field('saveProcessedImage', 'true')
        .expect(201);

      expect(mockProcessBusinessCard).toHaveBeenCalledWith(
        expect.any(Buffer),
        'processed-card.jpg',
        'test-user-id',
        expect.objectContaining({
          saveProcessedImage: true,
        })
      );
    });

    it('should respect custom OCR options', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'card-202',
          extractedData: {
            name: { text: 'Charlie Brown', confidence: 0.91 },
            rawText: 'Charlie Brown',
            confidence: 0.91,
          },
          confidence: 0.91,
          imageUrls: {
            original: 'https://cdn.example.com/charlie.jpg',
          },
          processingTime: 1900,
        },
      });

      const testImage = await createTestImage();

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'custom-ocr.jpg')
        .field('minConfidence', '0.9')
        .field('useAnalyzeDocument', 'false')
        .field('enhanceImage', 'false')
        .expect(201);

      expect(mockProcessBusinessCard).toHaveBeenCalledWith(
        expect.any(Buffer),
        'custom-ocr.jpg',
        'test-user-id',
        expect.objectContaining({
          ocrOptions: {
            minConfidence: 0.9,
            useAnalyzeDocument: false,
            enhanceImage: false,
          },
        })
      );
    });
  });

  describe('File Type Validation', () => {
    it('should accept JPEG images', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'jpeg-card',
          extractedData: { rawText: 'Test', confidence: 0.9 },
          confidence: 0.9,
          imageUrls: { original: 'https://cdn.example.com/test.jpg' },
          processingTime: 2000,
        },
      });

      const testImage = await createTestImage(600, 400, 'jpeg');

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'test.jpg')
        .expect(201);
    });

    it('should accept PNG images', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockResolvedValue({
        success: true,
        data: {
          cardId: 'png-card',
          extractedData: { rawText: 'Test', confidence: 0.9 },
          confidence: 0.9,
          imageUrls: { original: 'https://cdn.example.com/test.png' },
          processingTime: 2000,
        },
      });

      const testImage = await createTestImage(600, 400, 'png');

      await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'test.png')
        .expect(201);
    });
  });

  describe('Error Handling', () => {
    it('should handle service exceptions gracefully', async () => {
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;

      mockProcessBusinessCard.mockRejectedValue(new Error('Unexpected error'));

      const testImage = await createTestImage();

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'error-card.jpg')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Internal server error during card processing',
      });
    });

    it('should handle malformed request data', async () => {
      const testImage = await createTestImage();

      const response = await request(app)
        .post('/api/v1/cards/scan')
        .attach('image', testImage, 'test.jpg')
        .field('minConfidence', 'invalid-number')
        .expect(201); // Should still work with default values

      // The service should be called with default minConfidence
      const { CardProcessingService } = require('../../services/card-processing.service.js');
      const mockProcessBusinessCard = CardProcessingService.mock.instances[0].processBusinessCard;
      
      expect(mockProcessBusinessCard).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.jpg',
        'test-user-id',
        expect.objectContaining({
          ocrOptions: expect.objectContaining({
            minConfidence: 0.8, // Default value when parsing fails
          }),
        })
      );
    });
  });
});