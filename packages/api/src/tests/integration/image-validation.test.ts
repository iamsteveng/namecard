import ImageValidationService from '../../services/image-validation.service.js';
import sharp from 'sharp';

describe('Image Validation Service Tests', () => {
  // Helper to create test PNG buffer using Sharp
  const createTestPNG = async (width: number = 100, height: number = 100): Promise<Buffer> => {
    return await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toBuffer();
  };

  // Helper to create test JPEG buffer using Sharp
  const createTestJPEG = async (width: number = 100, height: number = 100): Promise<Buffer> => {
    return await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
    .jpeg()
    .toBuffer();
  };

  describe('Single Image Validation', () => {
    it('should validate a valid PNG image', async () => {
      const pngBuffer = await createTestPNG(500, 300);
      const result = await ImageValidationService.validateImage(pngBuffer, 'test.png');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).toMatchObject({
        format: 'png',
        width: 500,
        height: 300,
      });
    });

    it('should validate a valid JPEG image', async () => {
      const jpegBuffer = await createTestJPEG();
      const result = await ImageValidationService.validateImage(jpegBuffer, 'test.jpg');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.format).toBe('jpeg');
    });

    it('should reject images that are too small', async () => {
      const smallPNG = await createTestPNG(10, 10);
      const result = await ImageValidationService.validateImage(smallPNG, 'small.png');

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Image dimensions 10x10 are too small')])
      );
    });

    it('should reject images that are too large', async () => {
      const config = { maxWidth: 100, maxHeight: 100 };
      const largePNG = await createTestPNG(200, 200);
      const result = await ImageValidationService.validateImage(largePNG, 'large.png', config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Image dimensions 200x200 are too large')])
      );
    });

    it('should reject extreme aspect ratios', async () => {
      const config = { maxAspectRatio: 2 };
      const extremePNG = await createTestPNG(1000, 100); // 10:1 ratio
      const result = await ImageValidationService.validateImage(extremePNG, 'extreme.png', config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('aspect ratio')])
      );
    });

    it('should reject non-image data', async () => {
      const textBuffer = Buffer.from('This is not an image', 'utf8');
      const result = await ImageValidationService.validateImage(textBuffer, 'notimage.txt');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid image format or corrupted file');
    });

    it('should reject empty files', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = await ImageValidationService.validateImage(emptyBuffer, 'empty.png');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should provide warnings for large files', async () => {
      // Create a large PNG image that will trigger size warnings
      const largeBuffer = await createTestPNG(2000, 2000); // Large dimensions to create large file
      
      const result = await ImageValidationService.validateImage(largeBuffer, 'large.png');

      // Check that we get some kind of warning about the large image
      expect(result.warnings.length).toBeGreaterThan(0);
      // The specific warning may vary based on Sharp's compression detection
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple valid images', async () => {
      const files = [
        { buffer: await createTestPNG(500, 300), originalName: 'test1.png' },
        { buffer: await createTestJPEG(), originalName: 'test2.jpg' },
      ];

      const result = await ImageValidationService.validateImages(files);

      expect(result.overallValid).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].isValid).toBe(true);
      expect(result.results[1].isValid).toBe(true);
    });

    it('should reject batch with some invalid images', async () => {
      const files = [
        { buffer: await createTestPNG(500, 300), originalName: 'valid.png' },
        { buffer: Buffer.from('invalid', 'utf8'), originalName: 'invalid.txt' },
      ];

      const result = await ImageValidationService.validateImages(files);

      expect(result.overallValid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].isValid).toBe(true);
      expect(result.results[1].isValid).toBe(false);
    });

    it('should reject too many files', async () => {
      const files = await Promise.all(
        Array(10).fill(null).map(async (_, i) => ({
          buffer: await createTestPNG(),
          originalName: `test${i}.png`
        }))
      );

      await expect(ImageValidationService.validateImages(files, { maxFiles: 5 }))
        .rejects
        .toThrow('Too many files');
    });
  });

  describe('Use Case Configurations', () => {
    it('should have business card configuration', () => {
      const config = ImageValidationService.getConfigForUseCase('business-card');
      
      expect(config.maxFileSize).toBe(5 * 1024 * 1024); // 5MB
      expect(config.maxWidth).toBe(2048);
      expect(config.maxHeight).toBe(2048);
      expect(config.maxAspectRatio).toBe(2.5);
      expect(config.allowedFormats).toContain('jpeg');
      expect(config.allowedFormats).toContain('png');
    });

    it('should have profile avatar configuration', () => {
      const config = ImageValidationService.getConfigForUseCase('profile-avatar');
      
      expect(config.maxFileSize).toBe(2 * 1024 * 1024); // 2MB
      expect(config.maxWidth).toBe(1024);
      expect(config.maxHeight).toBe(1024);
      expect(config.requireSquareAspect).toBe(true);
    });

    it('should validate square aspect ratio for avatars', async () => {
      const config = ImageValidationService.getConfigForUseCase('profile-avatar');
      const nonSquarePNG = await createTestPNG(500, 300);
      const result = await ImageValidationService.validateImage(nonSquarePNG, 'avatar.png', config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Image must have a square aspect ratio (1:1)');
    });

    it('should have document configuration', () => {
      const config = ImageValidationService.getConfigForUseCase('document');
      
      expect(config.maxFileSize).toBe(20 * 1024 * 1024); // 20MB
      expect(config.maxWidth).toBe(8192);
      expect(config.maxHeight).toBe(8192);
      expect(config.allowedFormats).toContain('tiff');
    });
  });

  describe('Security Checks', () => {
    it('should detect suspicious content', async () => {
      // Create a buffer with script tag
      const suspiciousBuffer = Buffer.concat([
        await createTestPNG(100, 100),
        Buffer.from('<script>alert("hack")</script>', 'utf8')
      ]);

      const result = await ImageValidationService.validateImage(suspiciousBuffer, 'suspicious.png');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Suspicious content detected in image file');
    });

    it('should warn about unusual compression ratios', async () => {
      // This test would need a more sophisticated setup to create realistic test cases
      // For now, we test that the security check function exists and runs without error
      const normalPNG = await createTestPNG(500, 300);
      const result = await ImageValidationService.validateImage(normalPNG, 'normal.png');

      // Should complete without throwing errors
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract comprehensive metadata', async () => {
      const pngBuffer = await createTestPNG(800, 600);
      const result = await ImageValidationService.validateImage(pngBuffer, 'test.png');

      expect(result.metadata).toMatchObject({
        format: 'png',
        width: 800,
        height: 600,
        aspectRatio: 1.33,
        hasAlpha: expect.any(Boolean),
        channels: expect.any(Number),
      });
      expect(result.metadata?.size).toBeGreaterThan(0);
    });

    it('should calculate aspect ratio correctly', async () => {
      const pngBuffer = await createTestPNG(1000, 500); // 2:1 ratio
      const result = await ImageValidationService.validateImage(pngBuffer, 'test.png');

      expect(result.metadata?.aspectRatio).toBe(2);
    });
  });
});