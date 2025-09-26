/**
 * Mock-Based Route Tests for Search Endpoints (Phase 2)
 *
 * These tests focus on CI-compatible route testing by mocking all database
 * dependencies while thoroughly testing request/response handling, validation,
 * error handling, and response formats.
 *
 * Tested Endpoints:
 * - POST /api/v1/search/cards - Advanced card search
 * - POST /api/v1/search/companies - Company search
 * - GET /api/v1/search/suggestions - Search autocomplete
 * - GET /api/v1/search/filters - Dynamic search filters
 * - GET /api/v1/search/health - Search system health
 * - POST /api/v1/search/reindex - Trigger reindexing
 * - GET /api/v1/search/analytics - Search performance metrics
 */

// =============================================================================
// MOCK SETUP - MUST BE BEFORE IMPORTS
// =============================================================================

// Mock SearchService
const mockSearchService = {
  searchCards: jest.fn(),
  searchCompanies: jest.fn(),
  getSearchSuggestions: jest.fn(),
  getSearchHealth: jest.fn(),
  getSearchMetrics: jest.fn(),
};

jest.mock('../services/search.service.js', () => ({
  SearchService: jest.fn(() => mockSearchService),
}));

// Mock IndexingService
const mockIndexingService = {
  getIndexHealth: jest.fn(),
};

jest.mock('../services/indexing.service.js', () => ({
  IndexingService: jest.fn(() => mockIndexingService),
}));

// Mock Prisma
const mockPrisma = {
  card: {
    groupBy: jest.fn(),
  },
  company: {
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.mock('../lib/prisma.js', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock authentication middleware
jest.mock('../middleware/auth.middleware.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      email: 'test@example.com',
    };
    next();
  },
}));

// Mock logger to prevent test pollution
jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// =============================================================================
// IMPORTS
// =============================================================================

import request from 'supertest';

import app from '../app.js';

// =============================================================================
// TEST DATA
// =============================================================================

const mockCardSearchResults = {
  success: true,
  data: {
    results: [
      {
        item: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'John Doe',
          title: 'Software Engineer',
          company: 'Tech Corp',
          email: 'john@techcorp.com',
          phone: '+1-555-0123',
          notes: 'Great developer',
          tags: ['javascript', 'react'],
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
        },
        rank: 0.8,
        highlights: [
          {
            field: 'name',
            value: '<b>John</b> Doe',
          },
        ],
        score: 0.8,
        matchedFields: ['name', 'title'],
      },
    ],
    searchMeta: {
      query: 'software engineer',
      processedQuery: 'software & engineer',
      executionTime: '15ms',
      totalMatches: 1,
      searchMode: 'simple' as const,
      hasMore: false,
      searchId: 'search-123',
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  },
};

const mockCompanySearchResults = {
  success: true,
  data: {
    results: [
      {
        item: {
          id: '456e7890-e89b-12d3-a456-426614174000',
          name: 'Tech Corp',
          industry: 'Technology',
          domain: 'techcorp.com',
          description: 'Leading technology company',
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
        },
        rank: 0.9,
        score: 0.9,
      },
    ],
    searchMeta: {
      query: 'technology company',
      processedQuery: 'technology & company',
      executionTime: '12ms',
      totalMatches: 1,
      searchMode: 'simple' as const,
      hasMore: false,
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  },
};

const mockSuggestions = [
  'Software Engineer',
  'Software Developer',
  'Software Architect',
  'Senior Software Engineer',
  'Software Engineering Manager',
];

const mockSearchHealth = {
  status: 'healthy' as const,
  lastUpdated: new Date('2023-01-01T00:00:00Z'),
  avgResponseTime: 50,
  errorRate: 0.01,
  indexStatus: 'optimal' as const,
};

const mockIndexHealth = [
  {
    table: 'cards',
    completeness: 0.98,
    lastUpdated: new Date('2023-01-01T00:00:00Z'),
    rowCount: 1000,
    indexSize: '2.5MB',
  },
  {
    table: 'companies',
    completeness: 0.96, // Changed from 0.95 to 0.96 to be > 0.95
    lastUpdated: new Date('2023-01-01T00:00:00Z'),
    rowCount: 500,
    indexSize: '1.2MB',
  },
];

const mockSearchMetrics = {
  totalQueries: 1250,
  averageExecutionTime: 45,
  errorCount: 12,
  slowQueries: [
    {
      query: 'complex search query',
      executionTime: 250,
      timestamp: new Date('2023-01-01T00:00:00Z'),
    },
  ],
  lastErrors: [
    {
      error: 'Query timeout',
      query: 'timeout query',
      timestamp: new Date('2023-01-01T00:00:00Z'),
    },
  ],
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Search Routes - Mock-Based Tests (Phase 2)', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  // =============================================================================
  // POST /api/v1/search/cards - Advanced Card Search
  // =============================================================================

  describe('POST /api/v1/search/cards', () => {
    const endpoint = '/api/v1/search/cards';

    it('should successfully search cards with basic query', async () => {
      mockSearchService.searchCards.mockResolvedValue(mockCardSearchResults);

      const response = await request(app)
        .post(endpoint)
        .send({
          q: 'software engineer',
          page: 1,
          limit: 20,
        })
        .expect(200);

      expect(response.body).toEqual(mockCardSearchResults);
      expect(mockSearchService.searchCards).toHaveBeenCalledWith(
        {
          q: 'software engineer',
          page: 1,
          limit: 20,
        },
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      );
    });

    it('should handle advanced search parameters', async () => {
      mockSearchService.searchCards.mockResolvedValue(mockCardSearchResults);

      const response = await request(app)
        .post(endpoint)
        .send({
          q: 'developer',
          mustHave: ['javascript'],
          shouldHave: ['react', 'vue'],
          mustNotHave: ['intern'],
          searchInNames: true,
          searchInTitles: true,
          proximityDistance: 2,
          page: 2,
          limit: 10,
        })
        .expect(200);

      expect(mockSearchService.searchCards).toHaveBeenCalledWith(
        {
          q: 'developer',
          mustHave: ['javascript'],
          shouldHave: ['react', 'vue'],
          mustNotHave: ['intern'],
          searchInNames: true,
          searchInTitles: true,
          proximityDistance: 2,
          page: 2,
          limit: 10,
        },
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      );

      expect(response.body).toEqual(mockCardSearchResults);
    });

    it('should cap limit at 100', async () => {
      mockSearchService.searchCards.mockResolvedValue(mockCardSearchResults);

      await request(app)
        .post(endpoint)
        .send({
          q: 'test',
          limit: 200, // Should be capped at 100
        })
        .expect(200);

      expect(mockSearchService.searchCards).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        }),
        expect.any(String)
      );
    });

    it('should use default pagination values', async () => {
      mockSearchService.searchCards.mockResolvedValue(mockCardSearchResults);

      await request(app)
        .post(endpoint)
        .send({
          q: 'test',
        })
        .expect(200);

      expect(mockSearchService.searchCards).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 20,
        }),
        expect.any(String)
      );
    });

    it('should handle service errors', async () => {
      mockSearchService.searchCards.mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .post(endpoint)
        .send({
          q: 'test',
        })
        .expect(500);
    });

    it('should handle empty search results', async () => {
      const emptyResults = {
        ...mockCardSearchResults,
        data: {
          ...mockCardSearchResults.data,
          results: [],
          searchMeta: {
            ...mockCardSearchResults.data.searchMeta,
            totalMatches: 0,
          },
          pagination: {
            ...mockCardSearchResults.data.pagination,
            total: 0,
            totalPages: 0,
          },
        },
      };

      mockSearchService.searchCards.mockResolvedValue(emptyResults);

      const response = await request(app)
        .post(endpoint)
        .send({
          q: 'nonexistent',
        })
        .expect(200);

      expect(response.body).toEqual(emptyResults);
      expect(response.body.data.results).toHaveLength(0);
    });
  });

  // =============================================================================
  // POST /api/v1/search/companies - Company Search
  // =============================================================================

  describe('POST /api/v1/search/companies', () => {
    const endpoint = '/api/v1/search/companies';

    it('should successfully search companies', async () => {
      mockSearchService.searchCompanies.mockResolvedValue(mockCompanySearchResults);

      const response = await request(app)
        .post(endpoint)
        .send({
          q: 'technology company',
          page: 1,
          limit: 20,
        })
        .expect(200);

      expect(response.body).toEqual(mockCompanySearchResults);
      expect(mockSearchService.searchCompanies).toHaveBeenCalledWith({
        q: 'technology company',
        page: 1,
        limit: 20,
      });
    });

    it('should cap limit at 50 for companies', async () => {
      mockSearchService.searchCompanies.mockResolvedValue(mockCompanySearchResults);

      await request(app)
        .post(endpoint)
        .send({
          q: 'test',
          limit: 100, // Should be capped at 50 for companies
        })
        .expect(200);

      expect(mockSearchService.searchCompanies).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      );
    });

    it('should handle service errors', async () => {
      mockSearchService.searchCompanies.mockRejectedValue(new Error('Service unavailable'));

      await request(app)
        .post(endpoint)
        .send({
          q: 'test',
        })
        .expect(500);
    });
  });

  // =============================================================================
  // GET /api/v1/search/suggestions - Search Suggestions
  // =============================================================================

  describe('GET /api/v1/search/suggestions', () => {
    const endpoint = '/api/v1/search/suggestions';

    it('should return search suggestions', async () => {
      mockSearchService.getSearchSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get(endpoint)
        .query({
          prefix: 'sof',
          type: 'title',
          maxSuggestions: 5,
        })
        .expect(200);

      expect(response.body).toEqual(mockSuggestions);
      expect(mockSearchService.getSearchSuggestions).toHaveBeenCalledWith({
        prefix: 'sof',
        type: 'title',
        maxSuggestions: 5,
        userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      });
    });

    it('should validate prefix length (too short)', async () => {
      const response = await request(app)
        .get(endpoint)
        .query({
          prefix: 'a',
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Prefix must be at least 2 characters long',
          code: 'INVALID_PREFIX',
        },
      });
    });

    it('should handle service errors', async () => {
      mockSearchService.getSearchSuggestions.mockRejectedValue(
        new Error('Suggestion service failed')
      );

      await request(app)
        .get(endpoint)
        .query({
          prefix: 'test',
        })
        .expect(500);
    });
  });

  // =============================================================================
  // GET /api/v1/search/filters - Search Filters
  // =============================================================================

  describe('GET /api/v1/search/filters', () => {
    const endpoint = '/api/v1/search/filters';

    beforeEach(() => {
      // Mock Prisma responses
      mockPrisma.card.groupBy.mockResolvedValue([
        { company: 'Tech Corp', _count: { id: 10 } },
        { company: 'StartupCo', _count: { id: 5 } },
      ]);

      mockPrisma.$queryRaw.mockResolvedValue([
        { tag: 'javascript', count: BigInt(15) },
        { tag: 'react', count: BigInt(8) },
      ]);

      mockPrisma.company.groupBy.mockResolvedValue([
        { industry: 'Technology', _count: { id: 20 } },
        { industry: 'Finance', _count: { id: 12 } },
      ]);
    });

    it('should return search filters', async () => {
      const response = await request(app).get(endpoint).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          filters: {
            companies: expect.arrayContaining([
              expect.objectContaining({
                value: 'Tech Corp',
                label: 'Tech Corp',
                count: 10,
              }),
            ]),
            tags: expect.arrayContaining([
              expect.objectContaining({
                value: 'javascript',
                label: 'javascript',
                count: 15,
              }),
            ]),
            industries: expect.arrayContaining([
              expect.objectContaining({
                value: 'Technology',
                label: 'Technology',
                count: 20,
              }),
            ]),
            dateRanges: expect.arrayContaining([
              expect.objectContaining({
                value: 'last-7-days',
                label: 'Last 7 days',
              }),
            ]),
            locations: [],
          },
          searchMeta: expect.objectContaining({
            resultCount: expect.any(Number),
            executionTime: expect.stringMatching(/\d+ms/),
          }),
        },
      });
    });

    it('should handle database errors', async () => {
      mockPrisma.card.groupBy.mockRejectedValue(new Error('Database error'));

      await request(app).get(endpoint).expect(500);
    });
  });

  // =============================================================================
  // GET /api/v1/search/health - Search Health Check
  // =============================================================================

  describe('GET /api/v1/search/health', () => {
    const endpoint = '/api/v1/search/health';

    it('should return healthy status', async () => {
      mockSearchService.getSearchHealth.mockResolvedValue(mockSearchHealth);
      mockIndexingService.getIndexHealth.mockResolvedValue(mockIndexHealth);

      const response = await request(app).get(endpoint).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          search: {
            ...mockSearchHealth,
            lastUpdated: expect.any(String), // Date gets serialized to string
          },
          indexes: mockIndexHealth.map(index => ({
            ...index,
            lastUpdated: expect.any(String), // Date gets serialized to string
          })),
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle service errors', async () => {
      mockSearchService.getSearchHealth.mockRejectedValue(new Error('Health check failed'));

      const response = await request(app).get(endpoint).expect(503);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Search system health check failed',
          code: 'HEALTH_CHECK_FAILED',
        },
        timestamp: expect.any(String),
      });
    });
  });

  // =============================================================================
  // POST /api/v1/search/reindex - Trigger Reindexing
  // =============================================================================

  describe('POST /api/v1/search/reindex', () => {
    const endpoint = '/api/v1/search/reindex';

    it('should trigger cards reindexing', async () => {
      const response = await request(app).post(endpoint).send({ table: 'cards' }).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          jobId: expect.stringMatching(/^reindex-cards-\d+$/),
          message: 'Reindexing cards started',
          status: 'started',
        },
      });
    });

    it('should validate table parameter', async () => {
      const response = await request(app).post(endpoint).send({ table: 'invalid' }).expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Invalid table. Must be "cards", "companies", or "all"',
          code: 'INVALID_TABLE',
        },
      });
    });
  });

  // =============================================================================
  // GET /api/v1/search/analytics - Search Analytics
  // =============================================================================

  describe('GET /api/v1/search/analytics', () => {
    const endpoint = '/api/v1/search/analytics';

    it('should return search analytics', async () => {
      mockSearchService.getSearchMetrics.mockReturnValue(mockSearchMetrics);

      const response = await request(app).get(endpoint).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          analytics: {
            totalQueries: 1250,
            averageExecutionTime: 45,
            successRate: expect.any(Number),
            errorCount: 12,
            slowQueries: expect.arrayContaining([
              expect.objectContaining({
                query: 'complex search query',
                executionTime: 250,
              }),
            ]),
            recentErrors: expect.arrayContaining([
              expect.objectContaining({
                error: 'Query timeout',
                query: 'timeout query',
              }),
            ]),
            lastUpdated: expect.any(String),
          },
          period: 'session',
          timestamp: expect.any(String),
        },
      });
    });

    it('should calculate success rate correctly', async () => {
      mockSearchService.getSearchMetrics.mockReturnValue({
        ...mockSearchMetrics,
        totalQueries: 100,
        errorCount: 10,
      });

      const response = await request(app).get(endpoint).expect(200);

      expect(response.body.data.analytics.successRate).toBe(90); // (100-10)/100 * 100
    });
  });
});
