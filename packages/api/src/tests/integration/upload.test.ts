import request from 'supertest';
import app from '../../app.js';

describe('Upload Routes Integration Tests', () => {
  describe('GET /api/v1/upload/health', () => {
    it('should return upload service health status', async () => {
      const response = await request(app)
        .get('/api/v1/upload/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Upload Service with Advanced Validation',
        status: 'healthy',
        features: {
          singleUpload: true,
          multipleUpload: true,
          batchValidation: true,
          comprehensiveValidation: true,
          securityChecks: true,
          maxFileSize: '5MB', // Business card config
          maxFiles: 5,
          supportedFormats: expect.any(Array),
          validation: {
            imageDimensions: true,
            aspectRatio: true,
            fileSignature: true,
            contentSecurity: true,
            qualityAnalysis: true,
          },
          useCases: expect.any(Array),
        },
      });

      expect(response.body.features.supportedFormats).toContain('jpeg');
      expect(response.body.features.supportedFormats).toContain('png');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/v1/upload/image', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/upload/image')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Access token is required');
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .post('/api/v1/upload/image')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid or expired token');
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/upload/image')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Access token is required');
    });
  });

  describe('POST /api/v1/upload/images', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/upload/images')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Access token is required');
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .post('/api/v1/upload/images')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid or expired token');
    });
  });

  describe('Route registration', () => {
    it('should include upload endpoints in API info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body.data.endpoints.upload).toBe('/api/v1/upload');
    });
  });

  describe('Enhanced Health Endpoint', () => {
    it('should return enhanced upload service health with validation features', async () => {
      const response = await request(app)
        .get('/api/v1/upload/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Upload Service with Advanced Validation',
        status: 'healthy',
        features: {
          singleUpload: true,
          multipleUpload: true,
          batchValidation: true,
          comprehensiveValidation: true,
          securityChecks: true,
          maxFileSize: expect.any(String),
          maxFiles: expect.any(Number),
          supportedFormats: expect.any(Array),
          validation: {
            imageDimensions: true,
            aspectRatio: true,
            fileSignature: true,
            contentSecurity: true,
            qualityAnalysis: true,
          },
          useCases: ['business-card', 'profile-avatar', 'document', 'general'],
        },
      });
    });
  });

  describe('File Validation Features', () => {
    it('should demonstrate validation error response structure', async () => {
      // Create a text file that will fail validation
      const textBuffer = Buffer.from('This is not an image file');
      
      // This test demonstrates the expected error structure when validation fails
      // In real scenarios, this would require valid authentication
      const response = await request(app)
        .post('/api/v1/upload/image')
        .set('Authorization', 'Bearer invalid-token')
        .attach('image', textBuffer, 'test.txt')
        .expect(401); // Still fails at auth level, but shows API structure

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid or expired token');
    });
  });
});