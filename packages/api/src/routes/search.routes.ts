import { Router } from 'express';

import { searchController } from '../controllers/search.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { rateLimit } from '../middleware/rate-limit.middleware.js';

const router = Router();

// Rate limiting for search endpoints
const searchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 searches per minute
  message: 'Too many search requests, please slow down',
});

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 admin operations per minute
  message: 'Too many admin operations, please slow down',
});

// GET /api/v1/search - Universal search endpoint
router.get(
  '/',
  authenticateToken,
  searchRateLimit,
  asyncHandler(searchController.search.bind(searchController))
);

// GET /api/v1/search/cards - Search cards specifically
router.get(
  '/cards',
  authenticateToken,
  searchRateLimit,
  asyncHandler(async (req: any, res: any) => {
    req.query.index = 'cards';
    await searchController.search(req, res);
  })
);

// GET /api/v1/search/companies - Search companies specifically
router.get(
  '/companies',
  authenticateToken,
  searchRateLimit,
  asyncHandler(async (req: any, res: any) => {
    req.query.index = 'companies';
    await searchController.search(req, res);
  })
);

// GET /api/v1/search/health - Search service health check
router.get('/health', asyncHandler(searchController.healthCheck.bind(searchController)));

// GET /api/v1/search/stats - Get indexing statistics
router.get(
  '/stats',
  authenticateToken,
  asyncHandler(searchController.getIndexStats.bind(searchController))
);

// GET /api/v1/search/indexes/:index/info - Get index information
router.get(
  '/indexes/:index/info',
  authenticateToken,
  asyncHandler(searchController.getIndexInfo.bind(searchController))
);

// POST /api/v1/search/index/:type/:id - Index specific document
router.post(
  '/index/:type/:id',
  authenticateToken,
  adminRateLimit,
  asyncHandler(searchController.indexDocument.bind(searchController))
);

// DELETE /api/v1/search/index/:type/:id - Remove document from index
router.delete(
  '/index/:type/:id',
  authenticateToken,
  adminRateLimit,
  asyncHandler(searchController.removeDocument.bind(searchController))
);

// POST /api/v1/search/reindex - Full reindex (admin operation)
router.post(
  '/reindex',
  authenticateToken,
  adminRateLimit,
  asyncHandler(searchController.reindexAll.bind(searchController))
);

export default router;
