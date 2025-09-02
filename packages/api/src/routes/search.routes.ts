import { Router, Request, Response } from 'express';

import type {
  FullTextSearchParams,
  AdvancedSearchParams,
  SearchSuggestionParams,
} from '@namecard/shared/types/search.types';

import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import { validatePaginationAndSearch } from '../middleware/validation.middleware.js';
import { SearchService } from '../services/search.service.js';
import { IndexingService } from '../services/indexing.service.js';
import { SearchQueryError, validateSearchParams } from '../utils/search.utils.js';
import logger from '../utils/logger.js';

const router = Router();

// Initialize services
const searchService = new SearchService(prisma);
const indexingService = new IndexingService(prisma);

// POST /api/v1/search/cards - Advanced card search
router.post(
  '/cards',
  authenticateToken,
  validatePaginationAndSearch,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const searchParams: AdvancedSearchParams = {
        ...req.body,
        page: req.body.page || 1,
        limit: Math.min(req.body.limit || 20, 100), // Cap at 100
      };

      // Validate search parameters
      validateSearchParams(searchParams);

      const results = await searchService.searchCards(searchParams, req.user!.id);

      res.json(results);
    } catch (error) {
      logger.error('Advanced cards search error:', {
        error,
        body: req.body,
        userId: req.user?.id,
      });

      if (error instanceof SearchQueryError) {
        return res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
          },
        });
      }

      throw error;
    }
  })
);

// POST /api/v1/search/companies - Company search
router.post(
  '/companies',
  authenticateToken,
  validatePaginationAndSearch,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const searchParams: FullTextSearchParams = {
        ...req.body,
        page: req.body.page || 1,
        limit: Math.min(req.body.limit || 20, 50), // Cap at 50 for companies
      };

      // Validate search parameters
      validateSearchParams(searchParams);

      const results = await searchService.searchCompanies(searchParams);

      res.json(results);
    } catch (error) {
      logger.error('Company search error:', {
        error,
        body: req.body,
        userId: req.user?.id,
      });

      if (error instanceof SearchQueryError) {
        return res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
          },
        });
      }

      throw error;
    }
  })
);

// GET /api/v1/search/suggestions - Search suggestions/autocomplete
router.get(
  '/suggestions',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { prefix, type, maxSuggestions } = req.query;

      if (!prefix || typeof prefix !== 'string' || prefix.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Prefix must be at least 2 characters long',
            code: 'INVALID_PREFIX',
          },
        });
      }

      const suggestionParams: SearchSuggestionParams = {
        prefix: prefix.trim(),
        type: type as any,
        maxSuggestions: maxSuggestions ? parseInt(maxSuggestions as string) : 10,
        userId: req.user!.id,
      };

      const results = await searchService.getSearchSuggestions(suggestionParams);

      res.json(results);
    } catch (error) {
      logger.error('Search suggestions error:', {
        error,
        query: req.query,
        userId: req.user?.id,
      });

      if (error instanceof SearchQueryError) {
        return res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
          },
        });
      }

      throw error;
    }
  })
);

// GET /api/v1/search/filters - Get available search filters
router.get(
  '/filters',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      
      // Get dynamic filters based on user's data
      const [companies, tags, industries] = await Promise.all([
        // Get companies from user's cards
        prisma.card.groupBy({
          by: ['company'],
          where: {
            userId: req.user!.id,
            company: { not: null },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 50,
        }),
        
        // Get tags from user's cards
        prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
          SELECT unnest(tags) as tag, COUNT(*) as count
          FROM cards 
          WHERE user_id = ${req.user!.id}::uuid AND array_length(tags, 1) > 0
          GROUP BY tag
          ORDER BY count DESC
          LIMIT 50
        `,
        
        // Get industries from companies
        prisma.company.groupBy({
          by: ['industry'],
          where: {
            industry: { not: null },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 30,
        }),
      ]);

      const filters = {
        companies: companies
          .filter(c => c.company)
          .map(c => ({
            value: c.company!,
            label: c.company!,
            count: c._count.id,
          })),
        tags: tags.map(t => ({
          value: t.tag,
          label: t.tag,
          count: Number(t.count),
        })),
        industries: industries
          .filter(i => i.industry)
          .map(i => ({
            value: i.industry!,
            label: i.industry!,
            count: i._count.id,
          })),
        dateRanges: [
          { value: 'last-7-days', label: 'Last 7 days', count: 0 },
          { value: 'last-30-days', label: 'Last 30 days', count: 0 },
          { value: 'last-90-days', label: 'Last 90 days', count: 0 },
          { value: 'last-year', label: 'Last year', count: 0 },
        ],
        locations: [] as Array<{ value: string; label: string; count: number }>, // TODO: Add location filters when location data is available
      };

      const executionTime = Date.now().toString();

      res.json({
        success: true,
        data: {
          filters,
          searchMeta: {
            baseQuery: q || undefined,
            resultCount: filters.companies.length + filters.tags.length + filters.industries.length,
            executionTime: `${Date.now() - parseInt(executionTime)}ms`,
          },
        },
      });
    } catch (error) {
      logger.error('Search filters error:', {
        error,
        query: req.query,
        userId: req.user?.id,
      });

      throw error;
    }
  })
);

// GET /api/v1/search/health - Search system health
router.get(
  '/health',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const [searchHealth, indexHealth] = await Promise.all([
        searchService.getSearchHealth(),
        indexingService.getIndexHealth(),
      ]);

      const overallStatus = searchHealth.status === 'unhealthy' || 
        !indexHealth.every(h => h.completeness > 0.8) ? 'unhealthy' :
        searchHealth.status === 'degraded' || 
        !indexHealth.every(h => h.completeness > 0.95) ? 'degraded' : 'healthy';

      res.json({
        success: true,
        data: {
          status: overallStatus,
          search: searchHealth,
          indexes: indexHealth,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Search health check error:', { error, userId: req.user?.id });

      res.status(503).json({
        success: false,
        error: {
          message: 'Search system health check failed',
          code: 'HEALTH_CHECK_FAILED',
        },
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// POST /api/v1/search/reindex - Trigger search index rebuild
router.post(
  '/reindex',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { table } = req.body;

      if (!['cards', 'companies', 'all'].includes(table)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid table. Must be "cards", "companies", or "all"',
            code: 'INVALID_TABLE',
          },
        });
      }

      // For now, return a mock job ID - implement actual reindexing later
      const jobId = `reindex-${table}-${Date.now()}`;
      
      // TODO: Implement actual reindexing in IndexingService
      logger.info(`Reindex request for ${table}`, { jobId, userId: req.user?.id });

      res.json({
        success: true,
        data: {
          jobId,
          message: `Reindexing ${table} started`,
          status: 'started',
        },
      });
    } catch (error) {
      logger.error('Search reindex error:', {
        error,
        body: req.body,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to start reindexing',
          code: 'REINDEX_FAILED',
        },
      });
    }
  })
);

// GET /api/v1/search/analytics - Search performance analytics
router.get(
  '/analytics',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const searchMetrics = searchService.getSearchMetrics();
      
      const analytics = {
        totalQueries: searchMetrics.totalQueries,
        averageExecutionTime: searchMetrics.averageExecutionTime,
        successRate: searchMetrics.totalQueries > 0 ? 
          ((searchMetrics.totalQueries - searchMetrics.errorCount) / searchMetrics.totalQueries) * 100 : 
          100,
        errorCount: searchMetrics.errorCount,
        slowQueries: searchMetrics.slowQueries,
        recentErrors: searchMetrics.lastErrors,
        lastUpdated: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: {
          analytics,
          period: 'session', // Current session metrics
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Search analytics error:', { error, userId: req.user?.id });

      throw error;
    }
  })
);

export default router;