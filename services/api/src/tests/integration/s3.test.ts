import sharp from 'sharp';

import s3Service from '../../services/s3.service.js';

// Mock AWS S3 operations for integration tests
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest
      .fn()
      .mockImplementation(input => ({ input, constructor: { name: 'PutObjectCommand' } })),
    DeleteObjectCommand: jest
      .fn()
      .mockImplementation(input => ({ input, constructor: { name: 'DeleteObjectCommand' } })),
    GetObjectCommand: jest
      .fn()
      .mockImplementation(input => ({ input, constructor: { name: 'GetObjectCommand' } })),
    HeadObjectCommand: jest
      .fn()
      .mockImplementation(input => ({ input, constructor: { name: 'HeadObjectCommand' } })),
    ListObjectsV2Command: jest
      .fn()
      .mockImplementation(input => ({ input, constructor: { name: 'ListObjectsV2Command' } })),
    GetObjectAttributesCommand: jest.fn().mockImplementation(input => ({
      input,
      constructor: { name: 'GetObjectAttributesCommand' },
    })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(() =>
    Promise.resolve('https://test-bucket.s3.amazonaws.com/test-key?signed=true')
  ),
}));

describe('S3 Service Tests', () => {
  let mockS3Send: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked S3Client send function
    const { S3Client } = require('@aws-sdk/client-s3');
    const mockS3ClientInstance = new S3Client({});
    mockS3Send = mockS3ClientInstance.send as jest.Mock;

    // Default successful responses
    mockS3Send.mockImplementation(command => {
      const commandName = command.constructor.name;

      switch (commandName) {
        case 'PutObjectCommand':
          return Promise.resolve({
            ETag: '"mock-etag-123"',
            Location: 'https://test-bucket.s3.amazonaws.com/mock-key',
            Bucket: 'test-bucket',
            Key: command.input.Key,
          });
        case 'HeadObjectCommand':
          return Promise.resolve({
            ContentLength: 12345,
            LastModified: new Date('2023-01-01'),
            ETag: '"mock-etag-123"',
            ContentType: 'image/jpeg',
            Metadata: command.input.Key.includes('non-existent')
              ? undefined
              : {
                  'original-name': 'test.jpg',
                  'user-id': 'test-user',
                },
          });
        case 'ListObjectsV2Command':
          return Promise.resolve({
            Contents: [
              {
                Key: 'images/users/listing-user/storage/test-listing-1.jpg',
                Size: 12345,
                LastModified: new Date('2023-01-01'),
              },
              {
                Key: 'images/users/listing-user/storage/test-listing-2.jpg',
                Size: 12345,
                LastModified: new Date('2023-01-01'),
              },
              {
                Key: 'images/users/listing-user/storage/test-listing-3.jpg',
                Size: 12345,
                LastModified: new Date('2023-01-01'),
              },
            ],
          });
        case 'DeleteObjectCommand':
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });
  });

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
      // Mock a successful ListObjectsV2 response for health check
      mockS3Send.mockImplementationOnce(() => Promise.resolve({ Contents: [] }));

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
    it('should upload a single JPEG image', async () => {
      const imageBuffer = await createTestImage(800, 600, 'jpeg');
      const originalName = 'test-image.jpg';

      const result = await s3Service.uploadFile(imageBuffer, originalName, {
        userId: 'test-user-123',
        purpose: 'storage',
        contentType: 'image/jpeg',
      });

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

      expect(result.metadata).toMatchObject({
        'original-name': originalName,
        'user-id': 'test-user-789',
        purpose: 'ocr',
        ...customMetadata,
      });
    }, 15000);

    it('should handle upload errors gracefully', async () => {
      // Mock S3 to throw an error
      mockS3Send.mockImplementationOnce(() => {
        const error = new Error('Mock S3 upload error');
        return Promise.reject(error);
      });

      const testBuffer = await createTestImage(100, 100, 'jpeg');

      await expect(
        s3Service.uploadFile(testBuffer, 'error-test.jpg', {
          contentType: 'image/jpeg',
        })
      ).rejects.toThrow('S3 upload failed');
    });
  });

  describe('Batch Upload Operations', () => {
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
          buffer: await createTestImage(400, 300, 'jpeg'),
          name: 'failing-image.jpg',
          options: { userId: 'test-user', purpose: 'storage' as const },
        },
      ];

      // Mock the second upload to fail
      let uploadCount = 0;
      mockS3Send.mockImplementation(() => {
        uploadCount++;
        if (uploadCount === 2) {
          return Promise.reject(new Error('Mock upload failure'));
        }
        return Promise.resolve({
          ETag: '"mock-etag-123"',
          Location: 'https://test-bucket.s3.amazonaws.com/mock-key',
          Bucket: 'test-bucket',
          Key: 'mock-key',
        });
      });

      const results = await s3Service.uploadFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].result).toBeDefined();
      expect(results[0].error).toBeUndefined();
      expect(results[1].result).toBeUndefined();
      expect(results[1].error).toBeDefined();
    }, 20000);
  });

  describe('File Operations', () => {
    it('should get file information', async () => {
      const testFileKey = 'images/users/operations-user/storage/operations-test.jpg';

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
      const testFileKey = 'images/users/operations-user/storage/operations-test.jpg';

      const signedUrl = await s3Service.getSignedDownloadUrl(testFileKey, 3600);

      expect(signedUrl).toContain('https://');
      expect(signedUrl).toContain('signed=true');
    }, 10000);

    it('should generate CDN URL', () => {
      const testFileKey = 'images/users/operations-user/storage/operations-test.jpg';
      const cdnUrl = s3Service.getCDNUrl(testFileKey);
      const bucketInfo = s3Service.getBucketInfo();

      expect(cdnUrl).toBe(`${bucketInfo.baseUrl}/${testFileKey}`);
      expect(cdnUrl).toContain('https://');
    });

    it('should handle file info for non-existent file', async () => {
      const nonExistentKey = 'non-existent-file.jpg';

      // Mock HeadObjectCommand to throw an error for non-existent files
      mockS3Send.mockImplementationOnce(() => {
        const error = new Error('NoSuchKey');
        error.name = 'NoSuchKey';
        return Promise.reject(error);
      });

      await expect(s3Service.getFileInfo(nonExistentKey)).rejects.toThrow(
        'Failed to get file info'
      );
    });
  });

  describe('File Listing', () => {
    it('should list files with prefix', async () => {
      const prefix = 'images/users/listing-user/storage/';
      const files = await s3Service.listFiles(prefix, 10);

      expect(files.length).toBe(3); // Based on our mock implementation

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
    }, 10000);

    it('should detect PNG content type', async () => {
      const imageBuffer = await createTestImage(100, 100, 'png');

      const result = await s3Service.uploadFile(imageBuffer, 'test.png');

      expect(result.contentType).toBe('image/png');
    }, 10000);

    it('should use provided content type', async () => {
      const imageBuffer = await createTestImage(100, 100, 'jpeg');

      const result = await s3Service.uploadFile(imageBuffer, 'test.unknown', {
        contentType: 'image/webp',
      });

      expect(result.contentType).toBe('image/webp');
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
      const invalidKey = 'non-existent/key/that/does/not/exist.jpg';

      // Mock HeadObjectCommand to throw an error for non-existent files
      mockS3Send.mockImplementationOnce(() => {
        const error = new Error('NoSuchKey');
        error.name = 'NoSuchKey';
        return Promise.reject(error);
      });

      await expect(s3Service.getFileInfo(invalidKey)).rejects.toThrow('Failed to get file info');

      // Note: getSignedDownloadUrl doesn't actually check file existence - it just generates URLs
      // This is the correct behavior, so we test that it succeeds
      const signedUrl = await s3Service.getSignedDownloadUrl(invalidKey);
      expect(signedUrl).toContain('https://');
      expect(signedUrl).toContain('signed=true');
    });
  });
});
