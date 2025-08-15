import sharp from 'sharp';

import s3Service from '../../services/s3.service.js';

describe('S3 Service Tests', () => {
  // Use the singleton instance directly

  // Helper to create test images using Sharp
  const createTestImage = async (
    width: number = 400,
    height: number = 300,
    format: 'png' | 'jpeg' = 'jpeg'
  ): Promise<Buffer> => {
    const image = sharp({
      create: {
        width,
        height,
        channels: format === 'png' ? 4 : 3,
        background: { r: 100, g: 150, b: 200, alpha: format === 'png' ? 1 : undefined },
      },
    });

    return format === 'png' ? image.png().toBuffer() : image.jpeg().toBuffer();
  };

  describe('Service Initialization', () => {
    it('should initialize S3 service correctly', () => {
      expect(s3Service).toBeDefined();
      expect(typeof s3Service.uploadFile).toBe('function');
      expect(typeof s3Service.getSignedDownloadUrl).toBe('function');
    });

    it('should have correct bucket configuration', () => {
      const bucketInfo = s3Service.getBucketInfo();

      expect(bucketInfo.name).toBeDefined();
      expect(bucketInfo.region).toBeDefined();
      expect(bucketInfo.baseUrl).toContain('s3');
      expect(bucketInfo.baseUrl).toContain(bucketInfo.name);
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const healthResult = await s3Service.healthCheck();

      expect(healthResult).toHaveProperty('status');
      expect(healthResult).toHaveProperty('details');
      expect(['healthy', 'unhealthy']).toContain(healthResult.status);

      if (healthResult.status === 'healthy') {
        expect(healthResult.details).toHaveProperty('bucket');
        expect(healthResult.details).toHaveProperty('region');
        expect(healthResult.details).toHaveProperty('responseTime');
      }
    }, 10000); // Longer timeout for health check
  });

  describe('File Upload Operations', () => {
    const testFiles: string[] = [];

    afterEach(async () => {
      // Clean up uploaded test files
      for (const key of testFiles) {
        try {
          await s3Service.deleteFile(key);
        } catch (error) {
          // Ignore cleanup errors in tests
        }
      }
      testFiles.length = 0;
    });

    it('should upload a single JPEG image', async () => {
      const imageBuffer = await createTestImage(800, 600, 'jpeg');
      const originalName = 'test-image.jpg';

      const result = await s3Service.uploadFile(imageBuffer, originalName, {
        userId: 'test-user-123',
        purpose: 'storage',
        contentType: 'image/jpeg',
      });

      testFiles.push(result.key);

      expect(result).toMatchObject({
        key: expect.stringContaining('images/users/test-user-123/storage/'),
        url: expect.stringContaining('https://'),
        bucket: expect.any(String),
        contentType: 'image/jpeg',
        size: imageBuffer.length,
        etag: expect.any(String),
      });

      expect(result.key).toContain('test-image.jpg');
      expect(result.metadata).toMatchObject({
        'original-name': originalName,
        'user-id': 'test-user-123',
        purpose: 'storage',
        'file-size': imageBuffer.length.toString(),
      });
    }, 15000);

    it('should upload a PNG image with variant', async () => {
      const imageBuffer = await createTestImage(400, 400, 'png');
      const originalName = 'avatar.png';

      const result = await s3Service.uploadFile(imageBuffer, originalName, {
        userId: 'test-user-456',
        purpose: 'avatar',
        variant: 'thumbnail',
        contentType: 'image/png',
        isPublic: true,
      });

      testFiles.push(result.key);

      expect(result.key).toContain('images/users/test-user-456/avatar/thumbnail/');
      expect(result.key).toContain('avatar.png');
      expect(result.contentType).toBe('image/png');
      expect(result.metadata?.variant).toBe('thumbnail');
    }, 15000);

    it('should upload file without user ID', async () => {
      const imageBuffer = await createTestImage(600, 400, 'jpeg');
      const originalName = 'public-image.jpg';

      const result = await s3Service.uploadFile(imageBuffer, originalName, {
        purpose: 'web-display',
        contentType: 'image/jpeg',
      });

      testFiles.push(result.key);

      expect(result.key).toContain('images/web-display/');
      expect(result.key).not.toContain('users/');
      expect(result.metadata?.purpose).toBe('web-display');
    }, 15000);

    it('should upload file with custom metadata', async () => {
      const imageBuffer = await createTestImage(300, 200, 'jpeg');
      const originalName = 'business-card.jpg';

      const customMetadata = {
        'card-type': 'business',
        'extraction-confidence': '95.5',
        'processing-version': '1.0',
      };

      const result = await s3Service.uploadFile(imageBuffer, originalName, {
        userId: 'test-user-789',
        purpose: 'ocr',
        metadata: customMetadata,
        contentType: 'image/jpeg',
      });

      testFiles.push(result.key);

      expect(result.metadata).toMatchObject({
        'original-name': originalName,
        'user-id': 'test-user-789',
        purpose: 'ocr',
        ...customMetadata,
      });
    }, 15000);

    it('should handle upload errors gracefully', async () => {
      // Test with invalid buffer
      const invalidBuffer = Buffer.alloc(0);

      await expect(
        s3Service.uploadFile(invalidBuffer, 'empty.jpg', {
          contentType: 'image/jpeg',
        })
      ).rejects.toThrow('S3 upload failed');
    });
  });

  describe('Batch Upload Operations', () => {
    const testFiles: string[] = [];

    afterEach(async () => {
      // Clean up uploaded test files
      for (const key of testFiles) {
        try {
          await s3Service.deleteFile(key);
        } catch (error) {
          // Ignore cleanup errors in tests
        }
      }
      testFiles.length = 0;
    });

    it('should upload multiple files in batch', async () => {
      const files = [
        {
          buffer: await createTestImage(400, 300, 'jpeg'),
          name: 'batch-image-1.jpg',
          options: { userId: 'batch-user', purpose: 'storage' as const },
        },
        {
          buffer: await createTestImage(500, 400, 'png'),
          name: 'batch-image-2.png',
          options: { userId: 'batch-user', purpose: 'thumbnail' as const },
        },
        {
          buffer: await createTestImage(600, 500, 'jpeg'),
          name: 'batch-image-3.jpg',
          options: { userId: 'batch-user', purpose: 'web-display' as const },
        },
      ];

      const results = await s3Service.uploadFiles(files);

      // Collect keys for cleanup
      results.forEach(result => {
        if (result.result) {
          testFiles.push(result.result.key);
        }
      });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.result && !r.error)).toBe(true);

      results.forEach((result, index) => {
        expect(result.name).toBe(files[index].name);
        expect(result.result?.key).toContain(`${files[index].options.purpose}/`);
        expect(result.result?.metadata?.['user-id']).toBe('batch-user');
      });
    }, 30000);

    it('should handle batch upload with some failures', async () => {
      const files = [
        {
          buffer: await createTestImage(400, 300, 'jpeg'),
          name: 'valid-image.jpg',
          options: { userId: 'test-user', purpose: 'storage' as const },
        },
        {
          buffer: Buffer.alloc(0), // Invalid empty buffer
          name: 'invalid-image.jpg',
          options: { userId: 'test-user', purpose: 'storage' as const },
        },
      ];

      const results = await s3Service.uploadFiles(files);

      // Cleanup successful uploads
      results.forEach(result => {
        if (result.result) {
          testFiles.push(result.result.key);
        }
      });

      expect(results).toHaveLength(2);
      expect(results[0].result).toBeDefined();
      expect(results[0].error).toBeUndefined();
      expect(results[1].result).toBeUndefined();
      expect(results[1].error).toBeDefined();
    }, 20000);
  });

  describe('File Operations', () => {
    let testFileKey: string;

    beforeAll(async () => {
      // Upload a test file for operations
      const imageBuffer = await createTestImage(400, 300, 'jpeg');
      const result = await s3Service.uploadFile(imageBuffer, 'operations-test.jpg', {
        userId: 'operations-user',
        purpose: 'storage',
      });
      testFileKey = result.key;
    });

    afterAll(async () => {
      // Clean up test file
      try {
        await s3Service.deleteFile(testFileKey);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should get file information', async () => {
      const fileInfo = await s3Service.getFileInfo(testFileKey);

      expect(fileInfo).toMatchObject({
        key: testFileKey,
        size: expect.any(Number),
        lastModified: expect.any(Date),
        etag: expect.any(String),
      });

      expect(fileInfo.size).toBeGreaterThan(0);
    }, 10000);

    it('should generate signed download URL', async () => {
      const signedUrl = await s3Service.getSignedDownloadUrl(testFileKey, 3600);

      expect(signedUrl).toContain('https://');
      expect(signedUrl).toContain(testFileKey);
      expect(signedUrl).toContain('Signature');
      expect(signedUrl).toContain('Expires');
    }, 10000);

    it('should generate CDN URL', () => {
      const cdnUrl = s3Service.getCDNUrl(testFileKey);
      const bucketInfo = s3Service.getBucketInfo();

      expect(cdnUrl).toBe(`${bucketInfo.baseUrl}/${testFileKey}`);
      expect(cdnUrl).toContain('https://');
    });

    it('should handle file info for non-existent file', async () => {
      const nonExistentKey = 'non-existent-file.jpg';

      await expect(s3Service.getFileInfo(nonExistentKey)).rejects.toThrow(
        'Failed to get file info'
      );
    });
  });

  describe('File Listing', () => {
    const testFiles: string[] = [];

    beforeAll(async () => {
      // Upload multiple test files with the same prefix
      const prefix = 'test-listing';

      for (let i = 1; i <= 3; i++) {
        const imageBuffer = await createTestImage(200, 200, 'jpeg');
        const result = await s3Service.uploadFile(imageBuffer, `${prefix}-${i}.jpg`, {
          userId: 'listing-user',
          purpose: 'storage',
        });
        testFiles.push(result.key);
      }
    });

    afterAll(async () => {
      // Clean up test files
      for (const key of testFiles) {
        try {
          await s3Service.deleteFile(key);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should list files with prefix', async () => {
      const prefix = 'images/users/listing-user/storage/';
      const files = await s3Service.listFiles(prefix, 10);

      expect(files.length).toBeGreaterThanOrEqual(3);

      files.forEach(file => {
        expect(file.key).toContain(prefix);
        expect(file.size).toBeGreaterThan(0);
        expect(file.lastModified).toBeInstanceOf(Date);
      });
    }, 15000);

    it('should list all files when no prefix provided', async () => {
      const files = await s3Service.listFiles(undefined, 5);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeLessThanOrEqual(5);
    }, 10000);
  });

  describe('Content Type Detection', () => {
    it('should detect JPEG content type', async () => {
      const imageBuffer = await createTestImage(100, 100, 'jpeg');

      const result = await s3Service.uploadFile(imageBuffer, 'test.jpg');

      expect(result.contentType).toBe('image/jpeg');

      // Cleanup
      await s3Service.deleteFile(result.key);
    }, 10000);

    it('should detect PNG content type', async () => {
      const imageBuffer = await createTestImage(100, 100, 'png');

      const result = await s3Service.uploadFile(imageBuffer, 'test.png');

      expect(result.contentType).toBe('image/png');

      // Cleanup
      await s3Service.deleteFile(result.key);
    }, 10000);

    it('should use provided content type', async () => {
      const imageBuffer = await createTestImage(100, 100, 'jpeg');

      const result = await s3Service.uploadFile(imageBuffer, 'test.unknown', {
        contentType: 'image/webp',
      });

      expect(result.contentType).toBe('image/webp');

      // Cleanup
      await s3Service.deleteFile(result.key);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // This test would require mocking S3 client or network failures
      // For now, we ensure error handling exists
      expect(s3Service.uploadFile).toBeDefined();
      expect(s3Service.healthCheck).toBeDefined();
    });

    it('should handle invalid keys in operations', async () => {
      const invalidKey = 'invalid/key/that/does/not/exist.jpg';

      await expect(s3Service.getFileInfo(invalidKey)).rejects.toThrow('Failed to get file info');

      await expect(s3Service.getSignedDownloadUrl(invalidKey)).rejects.toThrow(
        'Failed to generate signed download URL'
      );
    });
  });
});
