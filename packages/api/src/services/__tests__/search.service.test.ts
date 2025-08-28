import type { SearchQuery, IndexableDocument } from '@namecard/shared';

import redisConfig from '../../config/redis.config.js';
import type { RedisSearchClient, RedisSearchResult } from '../../types/search.types.js';
import logger from '../../utils/logger.js';
import { SearchService } from '../search.service.js';

// Mock the Redis config
jest.mock('../../config/redis.config.js');
jest.mock('../../utils/logger.js');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockRedisClient: jest.Mocked<RedisSearchClient>;

  beforeEach(() => {
    // Create a mock Redis client
    mockRedisClient = {
      ft: {
        create: jest.fn(),
        dropIndex: jest.fn(),
        search: jest.fn(),
        info: jest.fn(),
      },
      hSet: jest.fn(),
      hGetAll: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ping: jest.fn(),
      connect: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    };

    // Mock redisConfig methods
    (redisConfig.getClient as jest.Mock).mockResolvedValue(mockRedisClient);
    (redisConfig.healthCheck as jest.Mock).mockResolvedValue({ status: 'healthy' });

    searchService = new SearchService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize search service successfully', async () => {
      mockRedisClient.ft.info.mockRejectedValueOnce(new Error('Index not found')); // Card index
      mockRedisClient.ft.info.mockRejectedValueOnce(new Error('Index not found')); // Company index
      mockRedisClient.ft.create.mockResolvedValue('OK');

      await searchService.initialize();

      expect(redisConfig.getClient).toHaveBeenCalled();
      expect(mockRedisClient.ft.create).toHaveBeenCalledTimes(2); // Card and company indexes
      expect(logger.info).toHaveBeenCalledWith('Search service initialized successfully');
    });

    it('should skip index creation if indexes already exist', async () => {
      mockRedisClient.ft.info.mockResolvedValue(['index_name', 'idx:cards']);

      await searchService.initialize();

      expect(mockRedisClient.ft.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Search index idx:cards already exists');
    });

    it('should throw error if initialization fails', async () => {
      (redisConfig.getClient as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await expect(searchService.initialize()).rejects.toThrow('Redis connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize search service:',
        expect.any(Error)
      );
    });
  });

  describe('indexDocument', () => {
    const sampleDocument: IndexableDocument = {
      id: 'test-card-1',
      type: 'card',
      title: 'John Doe Business Card',
      content: 'John Doe Software Engineer john@example.com',
      metadata: {
        userId: 'user-123',
        companyName: 'Tech Corp',
        personName: 'John Doe',
        email: 'john@example.com',
        tags: ['tech', 'software'],
        enriched: true,
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    beforeEach(async () => {
      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();
    });

    it('should index a document successfully', async () => {
      mockRedisClient.hSet.mockResolvedValue(1);

      await searchService.indexDocument(sampleDocument);

      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        'doc:cards:test-card-1',
        expect.objectContaining({
          id: 'test-card-1',
          type: 'card',
          title: 'John Doe Business Card',
          content: 'John Doe Software Engineer john@example.com',
          'metadata.userId': 'user-123',
          'metadata.companyName': 'Tech Corp',
          'metadata.personName': 'John Doe',
          'metadata.email': 'john@example.com',
          'metadata.tags': 'tech,software',
          'metadata.enriched': 'true',
          createdAt: sampleDocument.createdAt.getTime().toString(),
          updatedAt: sampleDocument.updatedAt.getTime().toString(),
        })
      );
      expect(logger.debug).toHaveBeenCalledWith('Indexed document: test-card-1 in idx:cards');
    });

    it('should handle indexing errors', async () => {
      mockRedisClient.hSet.mockRejectedValue(new Error('Redis error'));

      await expect(searchService.indexDocument(sampleDocument)).rejects.toThrow('Redis error');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to index document test-card-1:',
        expect.any(Error)
      );
    });
  });

  describe('search', () => {
    const searchQuery: SearchQuery = {
      q: 'john doe',
      limit: 10,
      offset: 0,
      fields: ['title', 'content'],
      highlight: {
        fields: ['title', 'content'],
        tags: { pre: '<mark>', post: '</mark>' },
      },
    };

    const mockSearchResult: RedisSearchResult = {
      total: 1,
      documents: [
        {
          id: 'doc:cards:test-card-1',
          value: {
            id: 'test-card-1',
            type: 'card',
            title: 'John Doe Business Card',
            content: 'Software Engineer',
            'metadata.userId': 'user-123',
            'metadata.companyName': 'Tech Corp',
            'metadata.tags': 'tech,software',
            createdAt: '1704067200000',
            updatedAt: '1704153600000',
          },
        },
      ],
    };

    beforeEach(async () => {
      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();
    });

    it('should perform search successfully', async () => {
      mockRedisClient.ft.search.mockResolvedValue(mockSearchResult);

      const result = await searchService.search(searchQuery, 'idx:cards');

      expect(result).toEqual({
        results: [
          {
            id: 'doc:cards:test-card-1',
            score: 1.0,
            document: {
              id: 'test-card-1',
              type: 'card',
              title: 'John Doe Business Card',
              content: 'Software Engineer',
              metadata: {
                userId: 'user-123',
                companyName: 'Tech Corp',
                tags: ['tech', 'software'],
              },
              createdAt: new Date(1704067200000),
              updatedAt: new Date(1704153600000),
            },
          },
        ],
        total: 1,
        query: 'john doe',
        took: expect.any(Number),
      });

      expect(mockRedisClient.ft.search).toHaveBeenCalledWith(
        'idx:cards',
        '(@title:(john doe) | @content:(john doe))',
        {
          LIMIT: { from: 0, size: 10 },
          HIGHLIGHT: {
            FIELDS: ['title', 'content'],
            TAGS: { open: '<mark>', close: '</mark>' },
          },
          SORTBY: 'createdAt DESC',
        }
      );
    });

    it('should handle search with filters', async () => {
      const queryWithFilters: SearchQuery = {
        ...searchQuery,
        filters: [
          { field: 'metadata.userId', value: 'user-123' },
          { field: 'metadata.enriched', value: true, operator: 'EQ' },
        ],
      };

      mockRedisClient.ft.search.mockResolvedValue(mockSearchResult);

      await searchService.search(queryWithFilters, 'idx:cards');

      expect(mockRedisClient.ft.search).toHaveBeenCalledWith(
        'idx:cards',
        expect.stringContaining('@metadata.userId:{user-123} @metadata.enriched:{true}'),
        expect.any(Object)
      );
    });

    it('should handle empty search results', async () => {
      mockRedisClient.ft.search.mockResolvedValue({
        total: 0,
        documents: [],
      });

      const result = await searchService.search(searchQuery, 'idx:cards');

      expect(result).toEqual({
        results: [],
        total: 0,
        query: 'john doe',
        took: expect.any(Number),
      });
    });

    it('should handle search errors', async () => {
      mockRedisClient.ft.search.mockRejectedValue(new Error('Search failed'));

      await expect(searchService.search(searchQuery, 'idx:cards')).rejects.toThrow('Search failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Search failed for query "john doe" in idx:cards:',
        expect.any(Error)
      );
    });
  });

  describe('removeDocument', () => {
    beforeEach(async () => {
      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();
    });

    it('should remove document from index', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await searchService.removeDocument('test-card-1', 'idx:cards');

      expect(mockRedisClient.del).toHaveBeenCalledWith('doc:cards:test-card-1');
      expect(logger.debug).toHaveBeenCalledWith('Removed document: test-card-1 from idx:cards');
    });

    it('should handle removal errors', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Delete failed'));

      await expect(searchService.removeDocument('test-card-1', 'idx:cards')).rejects.toThrow(
        'Delete failed'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to remove document test-card-1 from idx:cards:',
        expect.any(Error)
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all systems are working', async () => {
      (redisConfig.healthCheck as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latency: 5,
      });

      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();

      mockRedisClient.ft.search.mockResolvedValue({ total: 0, documents: [] });

      const health = await searchService.healthCheck();

      expect(health).toEqual({
        status: 'healthy',
        details: {
          redis: { status: 'healthy', latency: 5 },
          initialized: true,
          searchTest: true,
        },
      });
    });

    it('should return unhealthy status when Redis is down', async () => {
      (redisConfig.healthCheck as jest.Mock).mockResolvedValue({
        status: 'unhealthy',
        error: 'Connection failed',
      });

      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();

      const health = await searchService.healthCheck();

      expect(health).toEqual({
        status: 'unhealthy',
        details: {
          redis: { status: 'unhealthy', error: 'Connection failed' },
          initialized: true,
        },
      });
    });

    it('should return unhealthy status when search test fails', async () => {
      (redisConfig.healthCheck as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latency: 5,
      });

      mockRedisClient.ft.info.mockRejectedValue(new Error('Index not found'));
      mockRedisClient.ft.create.mockResolvedValue('OK');
      await searchService.initialize();

      mockRedisClient.ft.search.mockRejectedValue(new Error('Search test failed'));

      const health = await searchService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.searchTest).toBe(false);
    });
  });
});
