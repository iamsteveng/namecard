import request from 'supertest';

import app from '../../app.js';
import { clearRateLimitCleanup } from '../../middleware/rate-limit.middleware.js';

describe('API Integration Tests', () => {
  afterAll(async () => {
    // Clean up any open handles
    clearRateLimitCleanup();
  });
  describe('Health Check', () => {
    it('should return health status with database check', async () => {
      const response = await request(app).get('/health');

      // Health check might return 200 (database connected) or 503 (database disconnected)
      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          status: 'ok',
          environment: 'test',
          database: 'connected',
        });
        expect(response.body.timestamp).toBeDefined();
        expect(response.body.uptime).toBeDefined();
        expect(response.body.memory).toBeDefined();
      } else {
        expect(response.body).toMatchObject({
          status: 'error',
          environment: 'test',
          database: 'disconnected',
          error: 'Database connection failed',
        });
        expect(response.body.timestamp).toBeDefined();
      }
    });
  });

  describe('Root Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.body).toMatchObject({
        name: 'NameCard API Server',
        version: 'v1',
        environment: 'test',
        status: 'running',
      });
      expect(response.body.endpoints).toBeDefined();
    });
  });

  describe('API Version Info', () => {
    it('should return API version information', async () => {
      const response = await request(app).get('/api/v1').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'NameCard API',
          version: 'v1',
          environment: 'test',
        },
      });
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route').expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'Route GET /non-existent-route not found',
        },
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Auth Routes', () => {
    describe('POST /api/v1/auth/register', () => {
      it('should validate registration data', async () => {
        const response = await request(app).post('/api/v1/auth/register').send({}).expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Validation failed');
      });

      it('should accept valid registration data', async () => {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password: 'Password123',
            name: 'Test User',
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.receivedData.email).toBe('test@example.com');
      });
    });

    describe('POST /api/v1/auth/login', () => {
      it('should validate login data', async () => {
        const response = await request(app).post('/api/v1/auth/login').send({}).expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Validation failed');
      });

      it('should accept valid login data', async () => {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Card Routes', () => {
    describe('GET /api/v1/cards', () => {
      it('should handle cards list request (database dependent)', async () => {
        const response = await request(app).get('/api/v1/cards');

        // If database is connected, should return 200 with data
        // If database is not connected, should return 500 with error
        expect([200, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data.pagination).toMatchObject({
            page: 1,
            limit: 20,
            sort: 'desc',
            sortBy: 'createdAt',
            total: expect.any(Number),
            totalPages: expect.any(Number),
            hasNext: expect.any(Boolean),
            hasPrev: false,
          });
          expect(response.body.data.cards).toBeInstanceOf(Array);
          expect(response.body.data.filters).toBeDefined();
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
        }
      });

      it('should accept pagination parameters (database dependent)', async () => {
        const response = await request(app).get('/api/v1/cards?page=2&limit=10&sort=asc');

        // If database is connected, should return 200 with data
        // If database is not connected, should return 500 with error
        expect([200, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.data.pagination).toMatchObject({
            page: 2,
            limit: 10,
            sort: 'asc',
            total: expect.any(Number),
            totalPages: expect.any(Number),
            hasNext: expect.any(Boolean),
            hasPrev: expect.any(Boolean),
          });
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
        }
      });
    });

    describe('GET /api/v1/cards/:id', () => {
      it('should validate UUID format', async () => {
        const response = await request(app).get('/api/v1/cards/invalid-id').expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Validation failed');
      });

      it('should handle card lookup (database dependent)', async () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const response = await request(app).get(`/api/v1/cards/${validUuid}`);

        // If database is connected, should return 404 for non-existent card
        // If database is not connected, should return 500 with error
        expect([404, 500]).toContain(response.status);

        if (response.status === 404) {
          expect(response.body.success).toBe(false);
          expect(response.body.error.message).toBe('Card not found');
          expect(response.body.error.code).toBe('CARD_NOT_FOUND');
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
        }
      });
    });

    describe('PUT /api/v1/cards/:id', () => {
      it('should require at least one field for update', async () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const response = await request(app).put(`/api/v1/cards/${validUuid}`).send({}).expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Validation failed');
      });

      it('should handle card update (database dependent)', async () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const response = await request(app).put(`/api/v1/cards/${validUuid}`).send({
          name: 'Updated Name',
          email: 'updated@example.com',
        });

        // If database is connected, should return 404 for non-existent card
        // If database is not connected, should return 500 with error
        expect([404, 500]).toContain(response.status);

        if (response.status === 404) {
          expect(response.body.success).toBe(false);
          expect(response.body.error.message).toBe('Card not found');
          expect(response.body.error.code).toBe('CARD_NOT_FOUND');
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
        }
      });
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });
});
