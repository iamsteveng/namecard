import ImagePreprocessingService from '../../services/image-preprocessing.service.js';
import sharp from 'sharp';

describe('Image Preprocessing Service Tests', () => {
  // Helper to create test images using Sharp
  const createTestImage = async (width: number = 800, height: number = 600, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> => {
    const image = sharp({
      create: {
        width,
        height,
        channels: format === 'png' ? 4 : 3,
        background: { r: 100, g: 150, b: 200, alpha: format === 'png' ? 1 : undefined }
      }
    });

    return format === 'png' ? image.png().toBuffer() : image.jpeg().toBuffer();
  };

  describe('Single Image Processing', () => {
    it('should process image for storage', async () => {
      const inputBuffer = await createTestImage(1200, 900);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { purpose: 'storage' });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.metadata.originalSize).toBe(inputBuffer.length);
      expect(result.metadata.processedSize).toBeGreaterThan(0);
      expect(result.metadata.outputFormat).toBe('jpeg');
      expect(result.optimizations).toContain('Applied storage optimizations (light sharpening)');
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    it('should process image for OCR with specific optimizations', async () => {
      const inputBuffer = await createTestImage(800, 600);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { purpose: 'ocr' });

      expect(result.metadata.outputFormat).toBe('jpeg');
      expect(result.optimizations).toContain('Applied OCR optimizations (grayscale, normalize, sharpen)');
      expect(result.metadata.processedDimensions.width).toBeLessThanOrEqual(800);
      expect(result.metadata.processedDimensions.height).toBeLessThanOrEqual(600);
    });

    it('should create thumbnail with proper sizing', async () => {
      const inputBuffer = await createTestImage(1600, 1200);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { purpose: 'thumbnail' });

      expect(result.metadata.outputFormat).toBe('webp');
      expect(result.metadata.processedDimensions.width).toBeLessThanOrEqual(300);
      expect(result.metadata.processedDimensions.height).toBeLessThanOrEqual(300);
      expect(result.optimizations).toContain('Applied thumbnail sharpening for clarity at small sizes');
    });

    it('should resize large images', async () => {
      const inputBuffer = await createTestImage(4000, 3000);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { 
        purpose: 'storage',
        maxWidth: 1920,
        maxHeight: 1080
      });

      expect(result.metadata.processedDimensions.width).toBeLessThanOrEqual(1920);
      expect(result.metadata.processedDimensions.height).toBeLessThanOrEqual(1080);
      expect(result.optimizations).toContain('Resized to fit 1920x1080');
    });

    it('should maintain aspect ratio when resizing', async () => {
      const inputBuffer = await createTestImage(1600, 800); // 2:1 ratio
      const result = await ImagePreprocessingService.processImage(inputBuffer, {
        purpose: 'storage',
        maxWidth: 400,
        maxHeight: 400
      });

      const aspectRatio = result.metadata.processedDimensions.width / result.metadata.processedDimensions.height;
      expect(aspectRatio).toBeCloseTo(2, 1); // Should maintain 2:1 ratio
    });

    it('should auto-select optimal format', async () => {
      const inputBuffer = await createTestImage(800, 600, 'png');
      const result = await ImagePreprocessingService.processImage(inputBuffer, {
        purpose: 'web-display',
        format: 'auto'
      });

      expect(result.metadata.outputFormat).toBe('webp'); // Should choose WebP for web display
      expect(result.optimizations).toContain('Auto-selected webp format for web-display');
    });

    it('should remove metadata when requested', async () => {
      const inputBuffer = await createTestImage(400, 300);
      const result = await ImagePreprocessingService.processImage(inputBuffer, {
        purpose: 'storage',
        removeMetadata: true
      });

      expect(result.optimizations).toContain('Removed EXIF metadata for privacy');
    });

    it('should apply custom quality settings', async () => {
      const inputBuffer = await createTestImage(800, 600);
      const result = await ImagePreprocessingService.processImage(inputBuffer, {
        purpose: 'storage',
        quality: 95,
        format: 'jpeg'
      });

      expect(result.metadata.outputFormat).toBe('jpeg');
      // Higher quality should result in larger file size
      expect(result.metadata.compressionRatio).toBeLessThan(50); // Less compression
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple images in batch', async () => {
      const images = [
        { buffer: await createTestImage(800, 600), name: 'image1.png' },
        { buffer: await createTestImage(1200, 900), name: 'image2.png' },
        { buffer: await createTestImage(400, 300), name: 'image3.png' },
      ];

      const results = await ImagePreprocessingService.processBatch(images, { purpose: 'storage' });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.result && !r.error)).toBe(true);
      expect(results.every(r => r.result?.metadata.outputFormat === 'jpeg')).toBe(true);
    });

    it('should handle batch processing errors gracefully', async () => {
      const images = [
        { buffer: await createTestImage(400, 300), name: 'valid.png' },
        { buffer: Buffer.from('invalid image data'), name: 'invalid.txt' },
      ];

      const results = await ImagePreprocessingService.processBatch(images, { purpose: 'storage' });

      expect(results).toHaveLength(2);
      expect(results[0].result).toBeDefined();
      expect(results[0].error).toBeUndefined();
      expect(results[1].result).toBeUndefined();
      expect(results[1].error).toBeDefined();
    });
  });

  describe('Variant Creation', () => {
    it('should create multiple variants of the same image', async () => {
      const inputBuffer = await createTestImage(1600, 1200);
      const variants = await ImagePreprocessingService.createVariants(inputBuffer, [
        { name: 'storage', options: { purpose: 'storage' } },
        { name: 'thumbnail', options: { purpose: 'thumbnail' } },
        { name: 'ocr', options: { purpose: 'ocr' } },
        { name: 'web', options: { purpose: 'web-display' } },
      ]);

      expect(Object.keys(variants)).toHaveLength(4);
      expect(variants.storage).toBeDefined();
      expect(variants.thumbnail).toBeDefined();
      expect(variants.ocr).toBeDefined();
      expect(variants.web).toBeDefined();

      // Thumbnail should be smallest
      expect(variants.thumbnail.metadata.processedSize).toBeLessThan(variants.storage.metadata.processedSize);
      
      // OCR should be JPEG format
      expect(variants.ocr.metadata.outputFormat).toBe('jpeg');
      
      // Web should be WebP format
      expect(variants.web.metadata.outputFormat).toBe('webp');
    });
  });

  describe('Use Case Configurations', () => {
    it('should have storage configuration', () => {
      const config = ImagePreprocessingService.getOptionsForUseCase('storage');
      
      expect(config.purpose).toBe('storage');
      expect(config.quality).toBe(85);
      expect(config.maxWidth).toBe(2048);
      expect(config.maxHeight).toBe(2048);
      expect(config.format).toBe('jpeg');
      expect(config.optimize).toBe(true);
      expect(config.removeMetadata).toBe(true);
    });

    it('should have OCR configuration', () => {
      const config = ImagePreprocessingService.getOptionsForUseCase('ocr');
      
      expect(config.purpose).toBe('ocr');
      expect(config.quality).toBe(95); // High quality for OCR
      expect(config.maxWidth).toBe(3000);
      expect(config.maxHeight).toBe(3000);
      expect(config.format).toBe('jpeg');
      expect(config.optimize).toBe(false); // Preserve quality
    });

    it('should have thumbnail configuration', () => {
      const config = ImagePreprocessingService.getOptionsForUseCase('thumbnail');
      
      expect(config.purpose).toBe('thumbnail');
      expect(config.quality).toBe(75);
      expect(config.maxWidth).toBe(300);
      expect(config.maxHeight).toBe(300);
      expect(config.format).toBe('webp');
    });

    it('should have avatar configuration', () => {
      const config = ImagePreprocessingService.getOptionsForUseCase('avatar');
      
      expect(config.purpose).toBe('avatar');
      expect(config.quality).toBe(80);
      expect(config.maxWidth).toBe(512);
      expect(config.maxHeight).toBe(512);
      expect(config.format).toBe('webp');
    });

    it('should have web-display configuration', () => {
      const config = ImagePreprocessingService.getOptionsForUseCase('web-display');
      
      expect(config.purpose).toBe('web-display');
      expect(config.quality).toBe(80);
      expect(config.maxWidth).toBe(1920);
      expect(config.maxHeight).toBe(1080);
      expect(config.format).toBe('webp');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid image data', async () => {
      const invalidBuffer = Buffer.from('This is not an image');
      
      await expect(
        ImagePreprocessingService.processImage(invalidBuffer, { purpose: 'storage' })
      ).rejects.toThrow('Image preprocessing failed');
    });

    it('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      await expect(
        ImagePreprocessingService.processImage(emptyBuffer, { purpose: 'storage' })
      ).rejects.toThrow('Image preprocessing failed');
    });
  });

  describe('Performance and Optimization', () => {
    it('should track processing time', async () => {
      const inputBuffer = await createTestImage(800, 600);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { purpose: 'storage' });

      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThan(5000); // Should be under 5 seconds
    });

    it('should achieve compression for large images', async () => {
      const inputBuffer = await createTestImage(2000, 1500);
      const result = await ImagePreprocessingService.processImage(inputBuffer, { 
        purpose: 'storage',
        quality: 80
      });

      expect(result.metadata.compressionRatio).toBeGreaterThan(0);
      expect(result.metadata.processedSize).toBeLessThan(result.metadata.originalSize);
    });

    it('should provide optimization details', async () => {
      const inputBuffer = await createTestImage(1600, 1200);
      const result = await ImagePreprocessingService.processImage(inputBuffer, {
        purpose: 'storage',
        maxWidth: 800,
        removeMetadata: true
      });

      expect(result.optimizations.length).toBeGreaterThan(0);
      expect(result.optimizations).toContain('Resized to fit 800x800');
      expect(result.optimizations).toContain('Removed EXIF metadata for privacy');
      expect(result.optimizations).toContain('Applied storage optimizations (light sharpening)');
    });
  });
});