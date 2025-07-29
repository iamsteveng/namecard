import request from 'supertest';
import app from '../app';
import { clearRateLimitCleanup } from '../middleware/rate-limit.middleware';

describe('App', () => {
  afterAll(async () => {
    // Clean up any open handles
    clearRateLimitCleanup();
  });
  describe('GET /health', () => {
    it('should return health status with database check', async () => {
      const response = await request(app)
        .get('/health');

      // Health check might return 200 (database connected) or 503 (database disconnected)
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toEqual({
          status: 'ok',
          timestamp: expect.any(String),
          environment: 'test',
          uptime: expect.any(Number),
          memory: expect.any(Object),
          database: 'connected',
        });
      } else {
        expect(response.body).toEqual({
          status: 'error',
          timestamp: expect.any(String),
          environment: 'test',
          database: 'disconnected',
          error: 'Database connection failed',
        });
      }
    });
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toEqual({
        name: 'NameCard API Server',
        version: 'v1',
        environment: 'test',
        status: 'running',
        timestamp: expect.any(String),
        endpoints: {
          health: '/health',
          api: '/api/v1',
          auth: '/api/v1/auth',
          cards: '/api/v1/cards',
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      await request(app)
        .get('/unknown-route')
        .expect(404);
    });
  });

  describe('Security headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/');

      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      await request(app)
        .options('/health')
        .expect(204);
    });
  });
});