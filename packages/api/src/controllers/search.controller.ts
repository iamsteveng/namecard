import { SearchQuery } from '@namecard/shared';
import { Request, Response } from 'express';

import { AppError } from '../middleware/error.middleware.js';
import { indexingService } from '../services/indexing.service.js';
import { searchService } from '../services/search.service.js';
import { SEARCH_INDEXES } from '../types/search.types.js';
import logger from '../utils/logger.js';

export class SearchController {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const {
        q = '',
        limit = '10',
        offset = '0',
        fields,
        highlight = 'true',
        sort,
        filters,
        index = 'cards',
      } = req.query;

      // Validate search parameters
      if (!q && !filters) {
        throw new AppError('Search query or filters are required', 400);
      }

      // Parse query parameters
      const searchQuery: SearchQuery = {
        q: q as string,
        limit: Math.min(parseInt(limit as string), 100), // Max 100 results
        offset: parseInt(offset as string),
      };

      // Parse fields if provided
      if (fields && typeof fields === 'string') {
        searchQuery.fields = fields.split(',').map(f => f.trim());
      }

      // Parse highlighting options
      if (highlight === 'true') {
        searchQuery.highlight = {
          fields: searchQuery.fields || ['title', 'content'],
          tags: {
            pre: '<mark>',
            post: '</mark>',
          },
        };
      }

      // Parse sort options
      if (sort && typeof sort === 'string') {
        const sortParts = sort.split(':');
        if (sortParts.length === 2) {
          searchQuery.sort = [
            {
              field: sortParts[0],
              direction: sortParts[1].toUpperCase() as 'ASC' | 'DESC',
            },
          ];
        }
      }

      // Parse filters
      if (filters && typeof filters === 'string') {
        try {
          const parsedFilters = JSON.parse(filters);
          if (Array.isArray(parsedFilters)) {
            searchQuery.filters = parsedFilters;
          }
        } catch (error) {
          throw new AppError('Invalid filters format. Expected JSON array.', 400);
        }
      }

      // Add user filter for cards
      const indexName = index === 'companies' ? SEARCH_INDEXES.COMPANIES : SEARCH_INDEXES.CARDS;

      if (indexName === SEARCH_INDEXES.CARDS && req.user) {
        searchQuery.filters = searchQuery.filters || [];
        searchQuery.filters.push({
          field: 'metadata.userId',
          value: req.user.id,
        });
      }

      // Perform search
      const results = await searchService.search(searchQuery, indexName);

      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Search error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query,
        user: req.user?.id,
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            message: error.message,
            code: 'SEARCH_ERROR',
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Internal search error',
            code: 'INTERNAL_ERROR',
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async indexDocument(req: Request, res: Response): Promise<void> {
    try {
      const { type, id } = req.params;

      if (!['card', 'company'].includes(type)) {
        throw new AppError('Invalid document type. Must be "card" or "company".', 400);
      }

      if (type === 'card') {
        await indexingService.indexCard(id);
      } else {
        await indexingService.indexCompany(id);
      }

      res.json({
        success: true,
        data: {
          message: `${type} indexed successfully`,
          id,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Index document error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params: req.params,
        user: req.user?.id,
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            message: error.message,
            code: 'INDEX_ERROR',
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Internal indexing error',
            code: 'INTERNAL_ERROR',
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async removeDocument(req: Request, res: Response): Promise<void> {
    try {
      const { type, id } = req.params;

      if (!['card', 'company'].includes(type)) {
        throw new AppError('Invalid document type. Must be "card" or "company".', 400);
      }

      const indexName = type === 'card' ? SEARCH_INDEXES.CARDS : SEARCH_INDEXES.COMPANIES;

      await searchService.removeDocument(id, indexName);

      res.json({
        success: true,
        data: {
          message: `${type} removed from index successfully`,
          id,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Remove document error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params: req.params,
        user: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal error removing document from index',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async reindexAll(req: Request, res: Response): Promise<void> {
    try {
      // This is a potentially long-running operation
      // In production, this should be queued as a background job
      await indexingService.reindexAll();

      res.json({
        success: true,
        data: {
          message: 'Full reindex completed successfully',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Reindex all error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal error during full reindex',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getIndexStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await indexingService.getIndexStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get index stats error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal error getting index stats',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = await searchService.healthCheck();

      if (health.status === 'healthy') {
        res.json({
          success: true,
          data: health,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          success: false,
          data: health,
          error: {
            message: 'Search service is unhealthy',
            code: 'SERVICE_UNHEALTHY',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Search health check error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal error during health check',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getIndexInfo(req: Request, res: Response): Promise<void> {
    try {
      const { index = 'cards' } = req.params;
      const indexName = index === 'companies' ? SEARCH_INDEXES.COMPANIES : SEARCH_INDEXES.CARDS;

      const info = await searchService.getIndexInfo(indexName);

      res.json({
        success: true,
        data: {
          index: indexName,
          info,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get index info error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params: req.params,
        user: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Internal error getting index info',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const searchController = new SearchController();
