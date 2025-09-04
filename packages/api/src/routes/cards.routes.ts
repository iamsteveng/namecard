import type {
  BusinessCardEnrichmentData,
  CompanyEnrichmentData,
  PersonEnrichmentData,
} from '@namecard/shared/types/enrichment.types';
import { Router, Request, Response } from 'express';
import multer from 'multer';

import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import {
  validateId,
  validatePaginationAndSearch,
  validateSearch,
  // validateCardCreate,
  validateCardUpdate,
} from '../middleware/validation.middleware.js';
import { CardProcessingService } from '../services/card-processing.service.js';
import { SearchService } from '../services/search.service.js';
import logger from '../utils/logger.js';
import { SearchQueryError } from '../utils/search.utils.js';

const router = Router();

// Configure multer for card scanning
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // Single file for card scanning
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid file type. Only JPEG, PNG, and WebP images are allowed', 400));
    }
  },
});

// Initialize services
const cardProcessingService = new CardProcessingService(prisma);
const searchService = new SearchService(prisma);

// GET /api/v1/cards - List cards with pagination and search
router.get(
  '/',
  authenticateToken,
  validatePaginationAndSearch,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '20', sort = 'desc', sortBy = 'createdAt' } = req.query;
      const { q, tags, company, dateFrom, dateTo } = req.query;

      // If there's a search query, use full-text search
      if (q && typeof q === 'string' && q.trim().length > 0) {
        const searchResults = await searchService.searchCards(
          {
            q: q.trim(),
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            tags: tags as string | string[],
            company: company as string,
            dateFrom: dateFrom as string,
            dateTo: dateTo as string,
            searchMode: 'simple',
            highlight: false,
            includeRank: false, // Keep simple for backwards compatibility
          },
          req.user!.id
        );

        // Convert search results to match existing API format
        const cards = searchResults.data.results.map((result: any) => result.item);

        res.json({
          success: true,
          data: {
            cards,
            pagination: searchResults.data.pagination,
            filters: { q, tags, company, dateFrom, dateTo },
          },
        });
        return;
      }

      // Fallback to traditional Prisma query when no search query
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause for filtering
      const where: any = { userId: req.user!.id };

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
        if (dateFrom) {
          where.scanDate.gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          where.scanDate.lte = new Date(dateTo as string);
        }
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
    } catch (error) {
      logger.error('Cards listing error:', { error, query: req.query, userId: req.user?.id });

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

// GET /api/v1/cards/search - Advanced search
router.get(
  '/search',
  authenticateToken,
  validateSearch,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { q, tags, company, dateFrom, dateTo, page = '1', limit = '20' } = req.query;
      const {
        searchMode = 'simple',
        highlight = 'true',
        includeRank = 'true',
        minRank,
      } = req.query;

      // Use full-text search for advanced search capabilities
      const searchResults = await searchService.searchCards(
        {
          q: q as string,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          tags: tags as string | string[],
          company: company as string,
          dateFrom: dateFrom as string,
          dateTo: dateTo as string,
          searchMode: (searchMode as any) || 'simple',
          highlight: highlight === 'true',
          includeRank: includeRank === 'true',
          minRank: minRank ? parseFloat(minRank as string) : undefined,
        },
        req.user!.id
      );

      res.json({
        success: true,
        data: {
          results: searchResults.data.results.map((result: any) => result.item),
          searchMeta: searchResults.data.searchMeta,
          pagination: searchResults.data.pagination,
          query: {
            q,
            tags,
            company,
            dateFrom,
            dateTo,
            searchMode,
            highlight,
            includeRank,
            minRank,
          },
        },
      });
    } catch (error) {
      logger.error('Advanced search error:', { error, query: req.query, userId: req.user?.id });

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

// GET /api/v1/cards/tags - Get available tags
router.get(
  '/tags',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    // Get all unique tags from cards
    const cards = await prisma.card.findMany({
      select: { tags: true },
      where: {
        userId: req.user!.id,
        NOT: {
          tags: { isEmpty: true },
        },
      },
    });

    // Flatten and get unique tags
    const allTags = cards.flatMap((card: any) => card.tags);
    const uniqueTags = [...new Set(allTags)].sort();

    // Get tag counts
    const tagCounts = uniqueTags.map(tag => ({
      name: tag,
      count: allTags.filter((t: string) => t === tag).length,
    }));

    res.json({
      success: true,
      data: {
        tags: tagCounts,
        total: uniqueTags.length,
      },
    });
  })
);

// GET /api/v1/cards/companies - Get company list
router.get(
  '/companies',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    // Get companies from cards and Company table
    const [cardCompanies, registeredCompanies] = await Promise.all([
      // Get companies mentioned in cards
      prisma.card.groupBy({
        by: ['company'],
        where: {
          userId: req.user!.id,
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
    cardCompanies.forEach((item: any) => {
      if (item.company) {
        companyMap.set(item.company, {
          name: item.company,
          cardCount: item._count.id,
          isRegistered: false,
        });
      }
    });

    // Add/update with registered companies
    registeredCompanies.forEach((company: any) => {
      const existing = companyMap.get(company.name);
      companyMap.set(company.name, {
        id: company.id,
        name: company.name,
        industry: company.industry,
        cardCount: existing ? existing.cardCount : company._count.cards,
        isRegistered: true,
      });
    });

    const companies = Array.from(companyMap.values()).sort(
      (a, b) => b.cardCount - a.cardCount || a.name.localeCompare(b.name)
    );

    res.json({
      success: true,
      data: {
        companies,
        total: companies.length,
      },
    });
  })
);

// POST /api/v1/cards/scan - Upload and process new card
router.post(
  '/scan',
  authenticateToken,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }

      const userId = req.user!.id;
      const options = {
        skipDuplicateCheck: req.body.skipDuplicateCheck === 'true',
        saveOriginalImage: req.body.saveOriginalImage !== 'false',
        saveProcessedImage: req.body.saveProcessedImage === 'true',
        ocrOptions: {
          minConfidence: parseFloat(req.body.minConfidence) || 0.8,
          useAnalyzeDocument: req.body.useAnalyzeDocument !== 'false',
          enhanceImage: req.body.enhanceImage !== 'false',
        },
      };

      logger.info('Processing business card scan request', {
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        options,
      });

      const result = await cardProcessingService.processBusinessCard(
        req.file.buffer,
        req.file.originalname,
        userId,
        options
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error?.message || 'Processing failed',
          details: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: result.data?.duplicateCardId
          ? 'Business card processed successfully. Duplicate card detected.'
          : 'Business card processed successfully',
      });
    } catch (error) {
      logger.error('Card scan endpoint error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        fileName: req.file?.originalname,
      });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error during card processing',
      });
    }
  })
);

// GET /api/v1/cards/stats - Get user's card processing statistics
router.get(
  '/stats',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const stats = await cardProcessingService.getProcessingStats(userId);

      res.json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      logger.error('Card stats endpoint error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  })
);

// GET /api/v1/cards/:id - Get specific card details
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
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
              include: {
                enrichments: {
                  where: {
                    status: 'enriched',
                  },
                  orderBy: { enrichedAt: 'desc' },
                },
                newsArticles: {
                  orderBy: { publishedDate: 'desc' },
                  take: 5,
                },
              },
            },
          },
        },
        enrichments: {
          orderBy: { createdAt: 'desc' },
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

    // Build comprehensive enrichment data from database
    let enrichmentData: BusinessCardEnrichmentData | null = null;

    if (card.companies && card.companies.length > 0) {
      const primaryCompany = card.companies[0];
      const company = primaryCompany.company;

      if (company) {
        // Get the most recent enrichment data from multiple sources
        const latestEnrichments = company.enrichments.filter((e: { rawData: any }) => e.rawData);

        // Build company enrichment data
        const companyData: CompanyEnrichmentData = {
          name: company.name,
          domain: company.domain,
          website: company.website,
          description: company.description,
          industry: company.industry,
          headquarters: company.headquarters,
          location: company.location,
          size: company.size,
          employeeCount: company.employeeCount,
          founded: company.founded,
          annualRevenue: company.annualRevenue,
          funding: company.funding,
          technologies: company.technologies,
          keywords: company.keywords,
          linkedinUrl: company.linkedinUrl,
          twitterHandle: company.twitterHandle,
          facebookUrl: company.facebookUrl,
          logoUrl: company.logoUrl,
          confidence: company.overallEnrichmentScore ? company.overallEnrichmentScore / 100 : 0.8,
          lastUpdated: company.lastEnrichmentDate || company.lastUpdated,
        };

        // Add enhanced data from enrichment sources
        const citations: BusinessCardEnrichmentData['citations'] = [];
        const recentNews: CompanyEnrichmentData['recentNews'] = [];
        const keyPeople: CompanyEnrichmentData['keyPeople'] = [];
        const competitors: string[] = [];
        const recentDevelopments: string[] = [];
        let businessModel: string | undefined;
        let marketPosition: string | undefined;

        // Process enrichment data from sources like Perplexity
        for (const enrichment of latestEnrichments) {
          if (enrichment.rawData && typeof enrichment.rawData === 'object') {
            const data = enrichment.rawData as any;

            // Extract enhanced data based on source type
            if (enrichment.source === 'perplexity' && data.company) {
              if (data.company.businessModel) {
                businessModel = data.company.businessModel;
              }
              if (data.company.marketPosition) {
                marketPosition = data.company.marketPosition;
              }
            }

            // Extract citations if available
            if (data.citations && Array.isArray(data.citations)) {
              citations?.push(
                ...data.citations.map((c: any) => ({
                  url: c.url || '',
                  title: c.title || '',
                  source: c.source || 'Unknown',
                  accessDate: new Date().toISOString(),
                  relevance: c.relevance || 0.8,
                  category: (c.category as 'person' | 'company' | 'both') || 'company',
                }))
              );
            }

            // Extract recent news
            if (data.recentNews && Array.isArray(data.recentNews)) {
              recentNews?.push(...data.recentNews);
            }

            // Extract key people
            if (data.keyPeople && Array.isArray(data.keyPeople)) {
              keyPeople?.push(...data.keyPeople);
            }

            // Extract competitors
            if (data.competitors && Array.isArray(data.competitors)) {
              competitors.push(...data.competitors);
            }

            // Extract recent developments
            if (data.recentDevelopments && Array.isArray(data.recentDevelopments)) {
              recentDevelopments.push(...data.recentDevelopments);
            }
          }
        }

        // Add news articles from database
        if (company.newsArticles && company.newsArticles.length > 0) {
          const dbNews = company.newsArticles.map(
            (article: {
              title: string;
              summary?: string | null;
              url?: string | null;
              publishedDate?: Date | null;
              source?: string | null;
            }) => ({
              title: article.title,
              summary: article.summary || '',
              url: article.url || '',
              publishDate: article.publishedDate?.toISOString(),
              source: article.source || 'Database',
            })
          );
          recentNews.unshift(...dbNews);
        }

        // Add enhanced fields to company data
        if (businessModel) {
          companyData.businessModel = businessModel;
        }
        if (marketPosition) {
          companyData.marketPosition = marketPosition;
        }
        if (recentNews.length > 0) {
          companyData.recentNews = recentNews.slice(0, 10);
        }
        if (keyPeople.length > 0) {
          companyData.keyPeople = keyPeople.slice(0, 8);
        }
        if (competitors.length > 0) {
          companyData.competitors = [...new Set(competitors)].slice(0, 10);
        }
        if (recentDevelopments.length > 0) {
          companyData.recentDevelopments = [...new Set(recentDevelopments)].slice(0, 8);
        }
        if (citations.length > 0) {
          companyData.citations = citations.slice(0, 15);
        }

        // For now, personData will be null as we focus on company enrichment
        // Future enhancement: Extract person data from enrichment sources
        const personData: PersonEnrichmentData | null = null;

        // Build comprehensive enrichment data structure
        enrichmentData = {
          personData,
          companyData,
          citations: citations?.slice(0, 15),
          researchQuery:
            latestEnrichments.length > 0 ? `${card.name || ''} ${company.name}`.trim() : undefined,
          researchDate: company.lastEnrichmentDate || undefined,
          personConfidence: 0,
          companyConfidence: companyData.confidence || 0,
          overallConfidence: companyData.confidence || 0,
          lastUpdated: company.lastEnrichmentDate || company.lastUpdated,
        };
      }
    }

    // If no company data available, create empty enrichment structure
    if (!enrichmentData) {
      enrichmentData = {
        personData: null,
        companyData: null,
        citations: [],
        personConfidence: 0,
        companyConfidence: 0,
        overallConfidence: 0,
        lastUpdated: new Date(),
      };
    }

    // Add enrichment data to card response
    const cardWithEnrichment = {
      ...card,
      enrichmentData,
    };

    res.json({
      success: true,
      data: { card: cardWithEnrichment },
    });
  })
);

// PUT /api/v1/cards/:id - Update card information
router.put(
  '/:id',
  authenticateToken,
  validateId,
  validateCardUpdate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Check if card exists and belongs to user
    const existingCard = await prisma.card.findFirst({
      where: { id, userId: req.user!.id },
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
  })
);

// DELETE /api/v1/cards/:id - Delete card
router.delete(
  '/:id',
  authenticateToken,
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if card exists and belongs to user
    const existingCard = await prisma.card.findFirst({
      where: { id, userId: req.user!.id },
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
  })
);

// POST /api/v1/cards/:id/enrich - Trigger enrichment process
router.post(
  '/:id/enrich',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
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
  })
);

// POST /api/v1/cards/export - Export cards
router.post(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Implement card export (CSV, vCard, JSON)
    res.json({
      success: true,
      data: {
        message: 'Card export endpoint - to be implemented',
        format: req.body.format || 'csv',
      },
    });
  })
);

// POST /api/v1/cards/import - Bulk import cards
router.post(
  '/import',
  authenticateToken,
  asyncHandler(async (_req: Request, res: Response) => {
    // TODO: Implement bulk card import
    res.json({
      success: true,
      data: {
        message: 'Card import endpoint - to be implemented',
      },
    });
  })
);

export default router;
