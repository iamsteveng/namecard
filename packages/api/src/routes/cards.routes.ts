import { Router, Request, Response } from 'express';
import {
  validateId,
  validatePaginationAndSearch,
  validateSearch,
  // validateCardCreate,
  validateCardUpdate,
} from '../middleware/validation.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import prisma from '../lib/prisma.js';

const router = Router();

// GET /api/v1/cards - List cards with pagination and search
router.get('/', validatePaginationAndSearch, asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', sort = 'desc', sortBy = 'createdAt' } = req.query;
  const { q, tags, company, dateFrom, dateTo } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;
  
  // Build where clause for filtering
  const where: any = {};
  
  if (q) {
    where.OR = [
      { name: { contains: q as string, mode: 'insensitive' } },
      { company: { contains: q as string, mode: 'insensitive' } },
      { title: { contains: q as string, mode: 'insensitive' } },
      { email: { contains: q as string, mode: 'insensitive' } },
      { notes: { contains: q as string, mode: 'insensitive' } },
    ];
  }
  
  if (company) {
    where.company = { contains: company as string, mode: 'insensitive' };
  }
  
  if (tags && Array.isArray(tags)) {
    where.tags = { hasSome: tags as string[] };
  } else if (tags) {
    where.tags = { has: tags as string };
  }
  
  if (dateFrom || dateTo) {
    where.scanDate = {};
    if (dateFrom) where.scanDate.gte = new Date(dateFrom as string);
    if (dateTo) where.scanDate.lte = new Date(dateTo as string);
  }
  
  // Execute queries in parallel
  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: {
        [sortBy as string]: sort as 'asc' | 'desc',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        companies: {
          include: {
            company: {
              select: { id: true, name: true, industry: true },
            },
          },
        },
      },
    }),
    prisma.card.count({ where }),
  ]);
  
  const totalPages = Math.ceil(total / limitNum);
  
  res.json({
    success: true,
    data: {
      cards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        sort,
        sortBy,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: { q, tags, company, dateFrom, dateTo },
    },
  });
}));

// GET /api/v1/cards/search - Advanced search
router.get('/search', validateSearch, asyncHandler(async (req: Request, res: Response) => {
  const { q, tags, company, dateFrom, dateTo, page = '1', limit = '20' } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;
  
  // Build where clause for advanced search
  const where: any = {};
  
  if (q) {
    where.OR = [
      { name: { contains: q as string, mode: 'insensitive' } },
      { company: { contains: q as string, mode: 'insensitive' } },
      { title: { contains: q as string, mode: 'insensitive' } },
      { email: { contains: q as string, mode: 'insensitive' } },
      { phone: { contains: q as string, mode: 'insensitive' } },
      { notes: { contains: q as string, mode: 'insensitive' } },
      { extractedText: { contains: q as string, mode: 'insensitive' } },
    ];
  }
  
  if (company) {
    where.company = { contains: company as string, mode: 'insensitive' };
  }
  
  if (tags && Array.isArray(tags)) {
    where.tags = { hasSome: tags as string[] };
  } else if (tags) {
    where.tags = { has: tags as string };
  }
  
  if (dateFrom || dateTo) {
    where.scanDate = {};
    if (dateFrom) where.scanDate.gte = new Date(dateFrom as string);
    if (dateTo) where.scanDate.lte = new Date(dateTo as string);
  }
  
  const [results, total] = await Promise.all([
    prisma.card.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        companies: {
          include: {
            company: {
              select: { id: true, name: true, industry: true },
            },
          },
        },
      },
    }),
    prisma.card.count({ where }),
  ]);
  
  res.json({
    success: true,
    data: {
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      query: { q, tags, company, dateFrom, dateTo },
    },
  });
}));

// GET /api/v1/cards/tags - Get available tags
router.get('/tags', asyncHandler(async (_req: Request, res: Response) => {
  // Get all unique tags from cards
  const cards = await prisma.card.findMany({
    select: { tags: true },
    where: {
      NOT: {
        tags: { isEmpty: true },
      },
    },
  });
  
  // Flatten and get unique tags
  const allTags = cards.flatMap(card => card.tags);
  const uniqueTags = [...new Set(allTags)].sort();
  
  // Get tag counts
  const tagCounts = uniqueTags.map(tag => ({
    name: tag,
    count: allTags.filter(t => t === tag).length,
  }));
  
  res.json({
    success: true,
    data: {
      tags: tagCounts,
      total: uniqueTags.length,
    },
  });
}));

// GET /api/v1/cards/companies - Get company list
router.get('/companies', asyncHandler(async (_req: Request, res: Response) => {
  // Get companies from cards and Company table
  const [cardCompanies, registeredCompanies] = await Promise.all([
    // Get companies mentioned in cards
    prisma.card.groupBy({
      by: ['company'],
      where: {
        company: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    }),
    // Get registered companies
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        industry: true,
        _count: {
          select: {
            cards: true,
          },
        },
      },
    }),
  ]);
  
  // Combine and format results
  const companyMap = new Map();
  
  // Add companies from cards
  cardCompanies.forEach(item => {
    if (item.company) {
      companyMap.set(item.company, {
        name: item.company,
        cardCount: item._count.id,
        isRegistered: false,
      });
    }
  });
  
  // Add/update with registered companies
  registeredCompanies.forEach(company => {
    const existing = companyMap.get(company.name);
    companyMap.set(company.name, {
      id: company.id,
      name: company.name,
      industry: company.industry,
      cardCount: existing ? existing.cardCount : company._count.cards,
      isRegistered: true,
    });
  });
  
  const companies = Array.from(companyMap.values()).sort((a, b) => 
    b.cardCount - a.cardCount || a.name.localeCompare(b.name)
  );
  
  res.json({
    success: true,
    data: {
      companies,
      total: companies.length,
    },
  });
}));

// POST /api/v1/cards/scan - Upload and process new card
router.post('/scan', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement file upload, OCR processing, and card creation
  res.status(201).json({
    success: true,
    data: {
      message: 'Card scanning endpoint - to be implemented',
      // Will return processed card data
    },
  });
}));

// GET /api/v1/cards/:id - Get specific card details
router.get('/:id', validateId, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      companies: {
        include: {
          company: {
            select: { id: true, name: true, industry: true, website: true },
          },
        },
      },
      calendarEvents: {
        orderBy: { eventDate: 'desc' },
        take: 5,
      },
    },
  });
  
  if (!card) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Card not found',
        code: 'CARD_NOT_FOUND',
      },
      timestamp: new Date().toISOString(),
    });
  }
  
  res.json({
    success: true,
    data: { card },
  });
}));

// PUT /api/v1/cards/:id - Update card information
router.put('/:id', validateId, validateCardUpdate, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;
  
  // Check if card exists
  const existingCard = await prisma.card.findUnique({
    where: { id },
  });
  
  if (!existingCard) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Card not found',
        code: 'CARD_NOT_FOUND',
      },
      timestamp: new Date().toISOString(),
    });
  }
  
  // Update the card
  const updatedCard = await prisma.card.update({
    where: { id },
    data: {
      ...updateData,
      updatedAt: new Date(),
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      companies: {
        include: {
          company: {
            select: { id: true, name: true, industry: true },
          },
        },
      },
    },
  });
  
  res.json({
    success: true,
    data: { card: updatedCard },
    message: 'Card updated successfully',
  });
}));

// DELETE /api/v1/cards/:id - Delete card
router.delete('/:id', validateId, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // Check if card exists
  const existingCard = await prisma.card.findUnique({
    where: { id },
  });
  
  if (!existingCard) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Card not found',
        code: 'CARD_NOT_FOUND',
      },
      timestamp: new Date().toISOString(),
    });
  }
  
  // Delete the card (cascade will handle related records)
  await prisma.card.delete({
    where: { id },
  });
  
  res.json({
    success: true,
    data: {
      message: 'Card deleted successfully',
      cardId: id,
    },
  });
}));

// POST /api/v1/cards/:id/enrich - Trigger enrichment process
router.post('/:id/enrich', validateId, asyncHandler(async (req: Request, res: Response) => {
  // TODO: Implement card enrichment (company data, news, etc.)
  const { id } = req.params;
  
  res.json({
    success: true,
    data: {
      message: 'Card enrichment endpoint - to be implemented',
      cardId: id,
      // Will trigger background enrichment job
    },
  });
}));

// POST /api/v1/cards/export - Export cards
router.post('/export', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Implement card export (CSV, vCard, JSON)
  res.json({
    success: true,
    data: {
      message: 'Card export endpoint - to be implemented',
      format: req.body.format || 'csv',
    },
  });
}));

// POST /api/v1/cards/import - Bulk import cards
router.post('/import', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement bulk card import
  res.json({
    success: true,
    data: {
      message: 'Card import endpoint - to be implemented',
    },
  });
}));

export default router;