import request from 'supertest';

import app from '../../app.js';
import { indexingService } from '../../services/indexing.service.js';
import { searchService } from '../../services/search.service.js';

// Mock the search and indexing services
jest.mock('../../services/search.service.js');
jest.mock('../../services/indexing.service.js');

// Mock authentication middleware
jest.mock('../../middleware/auth.middleware.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

describe('Search Routes Integration Tests', () => {
  const mockAuthToken = 'Bearer test-jwt-token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/search', () => {
    it('should perform universal search successfully', async () => {
      const mockSearchResults = {
        results: [
          {
            id: 'card-123',
            score: 1.0,
            document: {
              id: 'card-123',
              type: 'card',
              title: 'John Doe Business Card',
              content: 'John Doe Software Engineer',
              metadata: {
                userId: 'test-user-id',
                personName: 'John Doe',
                companyName: 'Tech Corp',
              },
            },
          },
        ],
        total: 1,
        query: 'john doe',
        took: 45,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({
          q: 'john doe',
          limit: '10',
          offset: '0',
          fields: 'title,content',
          highlight: 'true',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockSearchResults,
        timestamp: expect.any(String),
      });

      expect(searchService.search).toHaveBeenCalledWith(
        {
          q: 'john doe',
          limit: 10,
          offset: 0,
          fields: ['title', 'content'],
          highlight: {
            fields: ['title', 'content'],
            tags: { pre: '<mark>', post: '</mark>' },
          },
          filters: [
            {
              field: 'metadata.userId',
              value: 'test-user-id',
            },
          ],
        },
        'idx:cards'
      );
    });

    it('should handle search with filters', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'tech',
        took: 12,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      const filters = JSON.stringify([
        { field: 'metadata.companyName', value: 'Tech Corp' },
        { field: 'metadata.enriched', value: true, operator: 'EQ' },
      ]);

      await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({
          q: 'tech',
          filters,
        })
        .expect(200);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            { field: 'metadata.companyName', value: 'Tech Corp' },
            { field: 'metadata.enriched', value: true, operator: 'EQ' },
            { field: 'metadata.userId', value: 'test-user-id' },
          ]),
        }),
        'idx:cards'
      );
    });

    it('should handle search with sorting', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'test',
        took: 8,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({
          q: 'test',
          sort: 'createdAt:DESC',
        })
        .expect(200);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: [{ field: 'createdAt', direction: 'DESC' }],
        }),
        'idx:cards'
      );
    });

    it('should reject search without query or filters', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Search query or filters are required',
          code: 'SEARCH_ERROR',
        },
        timestamp: expect.any(String),
      });

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should reject invalid filters format', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({
          q: 'test',
          filters: 'invalid-json',
        })
        .expect(400);

      expect(response.body.error.message).toContain('Invalid filters format');
    });

    it('should enforce result limit maximum', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'test',
        took: 5,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({
          q: 'test',
          limit: '500', // Above max limit of 100
        })
        .expect(200);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Should be capped at 100
        }),
        'idx:cards'
      );
    });

    it('should require authentication', async () => {
      await request(app).get('/api/v1/search').query({ q: 'test' }).expect(401);

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should handle search service errors', async () => {
      (searchService.search as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .get('/api/v1/search')
        .set('Authorization', mockAuthToken)
        .query({ q: 'test' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Internal search error',
          code: 'INTERNAL_ERROR',
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/v1/search/cards', () => {
    it('should search cards specifically', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'john',
        took: 15,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      await request(app)
        .get('/api/v1/search/cards')
        .set('Authorization', mockAuthToken)
        .query({ q: 'john' })
        .expect(200);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'john' }),
        'idx:cards'
      );
    });
  });

  describe('GET /api/v1/search/companies', () => {
    it('should search companies specifically', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'tech corp',
        took: 20,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      await request(app)
        .get('/api/v1/search/companies')
        .set('Authorization', mockAuthToken)
        .query({ q: 'tech corp' })
        .expect(200);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'tech corp' }),
        'idx:companies'
      );
    });
  });

  describe('GET /api/v1/search/health', () => {
    it('should return healthy status', async () => {
      const mockHealthStatus = {
        status: 'healthy' as const,
        details: {
          redis: { status: 'healthy', latency: 5 },
          initialized: true,
          searchTest: true,
        },
      };

      (searchService.healthCheck as jest.Mock).mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/search/health').expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockHealthStatus,
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy status', async () => {
      const mockHealthStatus = {
        status: 'unhealthy' as const,
        details: {
          redis: { status: 'unhealthy', error: 'Connection failed' },
          initialized: false,
        },
      };

      (searchService.healthCheck as jest.Mock).mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/search/health').expect(503);

      expect(response.body).toEqual({
        success: false,
        data: mockHealthStatus,
        error: {
          message: 'Search service is unhealthy',
          code: 'SERVICE_UNHEALTHY',
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/v1/search/stats', () => {
    it('should return index statistics', async () => {
      const mockStats = {
        cards: { total: 150, lastIndexed: new Date('2024-01-01') },
        companies: { total: 25, lastIndexed: new Date('2024-01-02') },
      };

      (indexingService.getIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/search/stats')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockStats,
        timestamp: expect.any(String),
      });
    });

    it('should require authentication', async () => {
      await request(app).get('/api/v1/search/stats').expect(401);

      expect(indexingService.getIndexStats).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/search/index/:type/:id', () => {
    it('should index a card document', async () => {
      (indexingService.indexCard as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/search/index/card/card-123')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'card indexed successfully',
          id: 'card-123',
        },
        timestamp: expect.any(String),
      });

      expect(indexingService.indexCard).toHaveBeenCalledWith('card-123');
    });

    it('should index a company document', async () => {
      (indexingService.indexCompany as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/search/index/company/company-123')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'company indexed successfully',
          id: 'company-123',
        },
        timestamp: expect.any(String),
      });

      expect(indexingService.indexCompany).toHaveBeenCalledWith('company-123');
    });

    it('should reject invalid document type', async () => {
      const response = await request(app)
        .post('/api/v1/search/index/invalid/doc-123')
        .set('Authorization', mockAuthToken)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid document type');
    });

    it('should require authentication', async () => {
      await request(app).post('/api/v1/search/index/card/card-123').expect(401);

      expect(indexingService.indexCard).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/search/index/:type/:id', () => {
    it('should remove a card document from index', async () => {
      (searchService.removeDocument as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/search/index/card/card-123')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'card removed from index successfully',
          id: 'card-123',
        },
        timestamp: expect.any(String),
      });

      expect(searchService.removeDocument).toHaveBeenCalledWith('card-123', 'idx:cards');
    });

    it('should remove a company document from index', async () => {
      (searchService.removeDocument as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/search/index/company/company-123')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'company removed from index successfully',
          id: 'company-123',
        },
        timestamp: expect.any(String),
      });

      expect(searchService.removeDocument).toHaveBeenCalledWith('company-123', 'idx:companies');
    });
  });

  describe('POST /api/v1/search/reindex', () => {
    it('should perform full reindex successfully', async () => {
      (indexingService.reindexAll as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/search/reindex')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'Full reindex completed successfully',
        },
        timestamp: expect.any(String),
      });

      expect(indexingService.reindexAll).toHaveBeenCalled();
    });

    it('should handle reindex errors', async () => {
      (indexingService.reindexAll as jest.Mock).mockRejectedValue(new Error('Reindex failed'));

      const response = await request(app)
        .post('/api/v1/search/reindex')
        .set('Authorization', mockAuthToken)
        .expect(500);

      expect(response.body.error.message).toContain('Internal error during full reindex');
    });

    it('should require authentication', async () => {
      await request(app).post('/api/v1/search/reindex').expect(401);

      expect(indexingService.reindexAll).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/search/indexes/:index/info', () => {
    it('should return index information', async () => {
      const mockIndexInfo = {
        index_name: 'idx:cards',
        num_docs: '100',
        max_doc_id: '150',
        num_terms: '1000',
      };

      (searchService.getIndexInfo as jest.Mock).mockResolvedValue(mockIndexInfo);

      const response = await request(app)
        .get('/api/v1/search/indexes/cards/info')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          index: 'idx:cards',
          info: mockIndexInfo,
        },
        timestamp: expect.any(String),
      });

      expect(searchService.getIndexInfo).toHaveBeenCalledWith('idx:cards');
    });

    it('should handle companies index info', async () => {
      const mockIndexInfo = {
        index_name: 'idx:companies',
        num_docs: '50',
      };

      (searchService.getIndexInfo as jest.Mock).mockResolvedValue(mockIndexInfo);

      await request(app)
        .get('/api/v1/search/indexes/companies/info')
        .set('Authorization', mockAuthToken)
        .expect(200);

      expect(searchService.getIndexInfo).toHaveBeenCalledWith('idx:companies');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Clear rate limit store before each test
      jest.resetModules();
    });

    it('should enforce search rate limits', async () => {
      const mockSearchResults = {
        results: [],
        total: 0,
        query: 'test',
        took: 1,
      };

      (searchService.search as jest.Mock).mockResolvedValue(mockSearchResults);

      // Make multiple requests rapidly
      const requests = Array.from({ length: 35 }, () =>
        request(app).get('/api/v1/search').set('Authorization', mockAuthToken).query({ q: 'test' })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
