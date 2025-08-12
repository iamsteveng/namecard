/**
 * Enrichment API Routes
 * 
 * REST API endpoints for company data enrichment
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { EnrichmentService } from '../services/enrichment/enrichment.service';
import prisma from '../lib/prisma.js';
import { 
  loadEnrichmentSourceConfigs, 
  loadEnrichmentSettings,
  validateEnrichmentConfig 
} from '../config/enrichment.config';
import { 
  EnrichCompanyRequest,
  EnrichBusinessCardRequest,
  DetailedEnrichCardRequest,
  BatchEnrichmentRequest 
} from '@namecard/shared/types/enrichment.types';
import { z } from 'zod';

const router = Router();

// Initialize enrichment service
const sourceConfigs = loadEnrichmentSourceConfigs();
const settings = loadEnrichmentSettings();
const configValidation = validateEnrichmentConfig(sourceConfigs, settings);

if (!configValidation.valid) {
  console.warn('Enrichment configuration issues:', configValidation.errors);
}

const enrichmentService = new EnrichmentService(prisma, sourceConfigs, settings);

// Validation schemas
const enrichCompanySchema = z.object({
  companyName: z.string().optional(),
  domain: z.string().optional(),
  website: z.string().url().optional(),
  sources: z.array(z.enum(['clearbit', 'linkedin', 'crunchbase', 'manual', 'opencorporates', 'perplexity'])).optional(),
  forceRefresh: z.boolean().optional()
}).refine(data => data.companyName || data.domain, {
  message: "Either companyName or domain must be provided"
});

const enrichBusinessCardSchema = z.object({
  // Person information
  personName: z.string().optional(),
  personTitle: z.string().optional(),
  
  // Company information  
  companyName: z.string().optional(),
  domain: z.string().optional(),
  website: z.string().url().optional(),
  
  // Card reference (optional for standalone enrichment)
  cardId: z.string().cuid().optional(),
  
  // Enrichment options
  sources: z.array(z.enum(['clearbit', 'linkedin', 'crunchbase', 'manual', 'opencorporates', 'perplexity'])).optional().default(['perplexity']),
  forceRefresh: z.boolean().optional().default(false),
  includePersonData: z.boolean().optional().default(true),
  includeCompanyData: z.boolean().optional().default(true)
}).refine(data => data.personName || data.companyName, {
  message: "Either personName or companyName must be provided"
});

const enrichCardSchema = z.object({
  cardId: z.string().cuid(),
  enrichmentTypes: z.array(z.enum(['company', 'person', 'social', 'news', 'logo'])).optional(),
  sources: z.array(z.enum(['clearbit', 'linkedin', 'crunchbase', 'manual', 'opencorporates', 'perplexity'])).optional(),
  triggeredBy: z.enum(['auto', 'manual', 'batch']).optional().default('manual')
});

const batchEnrichmentSchema = z.object({
  cardIds: z.array(z.string().cuid()).min(1).max(50),
  enrichmentTypes: z.array(z.enum(['company', 'person', 'social', 'news', 'logo'])).optional(),
  sources: z.array(z.enum(['clearbit', 'linkedin', 'crunchbase', 'manual', 'opencorporates', 'perplexity'])).optional(),
  maxConcurrent: z.number().min(1).max(10).optional().default(3)
});

/**
 * GET /api/v1/enrichment/health
 * Health check for enrichment service
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await enrichmentService.healthCheck();
    
    res.status(health.status === 'healthy' ? 200 : 503).json({
      status: health.status,
      sources: health.sources,
      availableSources: enrichmentService.getAvailableSources(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Enrichment health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/enrichment/sources
 * Get available enrichment sources
 */
router.get('/sources', authenticateToken, (req: Request, res: Response) => {
  try {
    const availableSources = enrichmentService.getAvailableSources();
    
    res.json({
      success: true,
      sources: availableSources,
      total: availableSources.length,
      configuration: sourceConfigs.map(config => ({
        source: config.source,
        enabled: config.enabled,
        hasApiKey: !!config.apiKey
      }))
    });
  } catch (error) {
    console.error('Error getting enrichment sources:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrichment sources',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/enrichment/company
 * Enrich company data from multiple sources
 */
router.post('/company', 
  authenticateToken,
  validateRequest(enrichCompanySchema),
  async (req: Request, res: Response) => {
    try {
      const request: EnrichCompanyRequest = req.body;
      
      console.log('Enriching company:', { 
        companyName: request.companyName, 
        domain: request.domain,
        sources: request.sources 
      });

      const result = await enrichmentService.enrichCompany(request);
      
      if (result.success) {
        res.json({
          success: true,
          data: result,
          message: 'Company enrichment completed successfully'
        });
      } else {
        res.status(422).json({
          success: false,
          data: result,
          message: 'Company enrichment failed'
        });
      }
    } catch (error) {
      console.error('Company enrichment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during company enrichment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/v1/enrichment/company/:companyId/status
 * Get enrichment status for a specific company
 */
router.get('/company/:companyId/status',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params;
      
      const status = await enrichmentService.getCompanyEnrichmentStatus(companyId);
      
      res.json({
        success: true,
        data: status,
        message: 'Company enrichment status retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting company enrichment status:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: 'Company not found',
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to get company enrichment status',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
);

/**
 * POST /api/v1/enrichment/business-card
 * Unified business card enrichment with combined person and company data
 */
router.post('/business-card',
  authenticateToken,
  validateRequest(enrichBusinessCardSchema),
  async (req: Request, res: Response) => {
    try {
      const request: EnrichBusinessCardRequest = req.body;
      const userId = req.user?.id;

      console.log('Enriching business card with unified approach:', { 
        personName: request.personName,
        personTitle: request.personTitle,
        companyName: request.companyName,
        domain: request.domain,
        sources: request.sources,
        includePersonData: request.includePersonData,
        includeCompanyData: request.includeCompanyData
      });

      const result = await enrichmentService.enrichBusinessCard(request);
      
      if (result.success) {
        res.json({
          success: true,
          data: {
            cardId: request.cardId,
            enrichmentData: result.enrichmentData,
            sources: result.sources,
            overallConfidence: result.overallConfidence,
            processingTimeMs: result.processingTimeMs,
            enrichmentDate: new Date()
          },
          message: 'Business card enrichment completed successfully'
        });
      } else {
        res.status(422).json({
          success: false,
          data: result,
          message: 'Business card enrichment failed'
        });
      }
    } catch (error) {
      console.error('Business card enrichment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during business card enrichment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/v1/enrichment/card
 * Enrich a business card with company data
 */
router.post('/card',
  authenticateToken,
  validateRequest(enrichCardSchema),
  async (req: Request, res: Response) => {
    try {
      const request: DetailedEnrichCardRequest = req.body;
      const userId = req.user?.id;

      // Verify the card belongs to the authenticated user
      const card = await prisma.card.findFirst({
        where: {
          id: request.cardId,
          userId: userId
        }
      });

      if (!card) {
        return res.status(404).json({
          success: false,
          message: 'Card not found or access denied'
        });
      }

      // For now, implement basic card enrichment by enriching the company
      // Full card enrichment with person data will be implemented later
      if (card.company) {
        // Find or create Company record
        let companyRecord = await prisma.company.findFirst({
          where: {
            OR: [
              { name: { equals: card.company, mode: 'insensitive' } },
              { domain: card.website ? card.website.replace(/https?:\/\//, '').replace(/\/$/, '') : undefined }
            ]
          }
        });

        if (!companyRecord) {
          // Create new company record
          const domain = card.website ? card.website.replace(/https?:\/\//, '').replace(/\/$/, '') : null;
          companyRecord = await prisma.company.create({
            data: {
              name: card.company,
              domain: domain,
              website: card.website,
              // Initialize with default values
              description: null,
              industry: null,
              location: null,
              size: null,
              employeeCount: null,
              founded: null,
              annualRevenue: null,
              funding: null
            }
          });

          // Link the card to the company
          await prisma.cardCompany.upsert({
            where: {
              cardId_companyId: {
                cardId: card.id,
                companyId: companyRecord.id
              }
            },
            update: {},
            create: {
              cardId: card.id,
              companyId: companyRecord.id
            }
          });
        } else {
          // Ensure card is linked to existing company
          await prisma.cardCompany.upsert({
            where: {
              cardId_companyId: {
                cardId: card.id,
                companyId: companyRecord.id
              }
            },
            update: {},
            create: {
              cardId: card.id,
              companyId: companyRecord.id
            }
          });
        }

        const companyEnrichmentRequest: EnrichCompanyRequest = {
          companyName: card.company,
          website: card.website,
          sources: request.sources,
          forceRefresh: false
        };

        let enrichmentResult;
        let errorMessage = null;

        try {
          enrichmentResult = await enrichmentService.enrichCompany(companyEnrichmentRequest);
        } catch (enrichmentError) {
          console.error('Enrichment service error:', enrichmentError);
          errorMessage = (enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError)) || 'Enrichment service failed';
          
          // Create failed enrichment record
          await prisma.cardEnrichment.create({
            data: {
              cardId: request.cardId,
              enrichmentType: 'company',
              status: 'failed',
              companiesFound: 0,
              dataPointsAdded: 0,
              confidence: 0.0,
              triggeredBy: request.triggeredBy || 'manual',
              enrichedAt: null,
              errorMessage: errorMessage,
              processingTimeMs: 0
            }
          });

          return res.status(400).json({
            success: false,
            error: errorMessage,
            message: 'Card enrichment failed'
          });
        }
        
        // Update the company record with enrichment data if successful
        if (enrichmentResult.success && enrichmentResult.enrichmentData) {
          const enrichmentData = enrichmentResult.enrichmentData;
          await prisma.company.update({
            where: { id: companyRecord.id },
            data: {
              // Update company fields with enriched data
              description: enrichmentData.description || companyRecord.description,
              industry: enrichmentData.industry || companyRecord.industry,
              location: enrichmentData.headquarters || enrichmentData.location || companyRecord.location,
              size: enrichmentData.size || companyRecord.size,
              employeeCount: enrichmentData.employeeCount || companyRecord.employeeCount,
              founded: enrichmentData.founded || companyRecord.founded,
              annualRevenue: enrichmentData.annualRevenue || companyRecord.annualRevenue,
              funding: enrichmentData.funding || companyRecord.funding,
              technologies: enrichmentData.technologies || companyRecord.technologies,
              keywords: enrichmentData.keywords || companyRecord.keywords,
              linkedinUrl: enrichmentData.linkedinUrl || companyRecord.linkedinUrl,
              twitterHandle: enrichmentData.twitterHandle || companyRecord.twitterHandle,
              facebookUrl: enrichmentData.facebookUrl || companyRecord.facebookUrl,
              logoUrl: enrichmentData.logoUrl || companyRecord.logoUrl,
              overallEnrichmentScore: (enrichmentResult.overallConfidence || 0) * 100,
              lastEnrichmentDate: new Date()
            }
          });

          // Create CompanyEnrichment record for tracking raw data
          await prisma.companyEnrichment.upsert({
            where: {
              companyId_source: {
                companyId: companyRecord.id,
                source: 'perplexity' // or determine from request.sources
              }
            },
            update: {
              status: 'enriched',
              confidence: (enrichmentResult.overallConfidence || 0) * 100,
              rawData: enrichmentResult.enrichmentData as any,
              enrichedAt: new Date(),
              errorMessage: null,
              retryCount: 0
            },
            create: {
              companyId: companyRecord.id,
              source: 'perplexity', // or determine from request.sources
              status: 'enriched',
              confidence: (enrichmentResult.overallConfidence || 0) * 100,
              rawData: enrichmentResult.enrichmentData as any,
              enrichedAt: new Date()
            }
          });
        }
        
        // Create successful enrichment record
        await prisma.cardEnrichment.create({
          data: {
            cardId: request.cardId,
            enrichmentType: 'company',
            status: enrichmentResult.success ? 'completed' : 'failed',
            companiesFound: enrichmentResult.success ? 1 : 0,
            dataPointsAdded: enrichmentResult.success ? 
              Object.keys(enrichmentResult.enrichmentData || {}).length : 0,
            confidence: enrichmentResult.overallConfidence || 0.0,
            triggeredBy: request.triggeredBy || 'manual',
            enrichedAt: enrichmentResult.success ? new Date() : null,
            errorMessage: enrichmentResult.success ? null : 'Company enrichment failed',
            processingTimeMs: enrichmentResult.processingTimeMs || 0
          }
        });

        res.json({
          success: true,
          data: {
            cardId: request.cardId,
            companyData: enrichmentResult.enrichmentData,
            status: enrichmentResult.success ? 'enriched' : 'failed',
            sources: request.sources || ['clearbit'],
            confidence: enrichmentResult.overallConfidence || 0.0,
            processingTime: enrichmentResult.processingTimeMs || 0,
            enrichmentDate: new Date()
          },
          message: 'Card enrichment completed'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Card does not have company information to enrich'
        });
      }
    } catch (error) {
      console.error('Card enrichment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during card enrichment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/v1/enrichment/batch
 * Batch enrich multiple cards
 */
router.post('/batch',
  authenticateToken,
  validateRequest(batchEnrichmentSchema),
  async (req: Request, res: Response) => {
    try {
      const request: BatchEnrichmentRequest = req.body;
      const userId = req.user?.id;
      const startTime = Date.now();

      // Verify all cards belong to the authenticated user
      const cards = await prisma.card.findMany({
        where: {
          id: { in: request.cardIds },
          userId: userId
        }
      });

      if (cards.length !== request.cardIds.length) {
        return res.status(404).json({
          success: false,
          message: 'Some cards not found or access denied'
        });
      }

      // Process cards in batches
      const results = [];
      const batchSize = request.maxConcurrent || 3;
      
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (card) => {
          try {
            // Simple card enrichment (company data)
            if (card.company) {
              const companyRequest: EnrichCompanyRequest = {
                companyName: card.company,
                website: card.website,
                sources: request.sources,
                forceRefresh: false
              };

              const enrichmentResult = await enrichmentService.enrichCompany(companyRequest);
              
              // Create card enrichment record
              await prisma.cardEnrichment.create({
                data: {
                  cardId: card.id,
                  enrichmentType: 'company',
                  status: enrichmentResult.success ? 'completed' : 'failed',
                  companiesFound: enrichmentResult.success ? 1 : 0,
                  dataPointsAdded: enrichmentResult.success ? 
                    Object.keys(enrichmentResult.enrichmentData).length : 0,
                  confidence: enrichmentResult.overallConfidence,
                  triggeredBy: 'batch',
                  enrichedAt: enrichmentResult.success ? new Date() : null,
                  errorMessage: enrichmentResult.success ? null : 'Company enrichment failed',
                  processingTimeMs: enrichmentResult.processingTimeMs
                }
              });

              return {
                success: true,
                cardId: card.id,
                enrichments: [{
                  type: 'company' as const,
                  status: enrichmentResult.success ? 'enriched' as const : 'failed' as const,
                  companiesFound: enrichmentResult.success ? 1 : 0,
                  dataPointsAdded: enrichmentResult.success ? 
                    Object.keys(enrichmentResult.enrichmentData).length : 0,
                  confidence: enrichmentResult.overallConfidence
                }],
                overallConfidence: enrichmentResult.overallConfidence,
                processingTimeMs: enrichmentResult.processingTimeMs
              };
            } else {
              return {
                success: false,
                cardId: card.id,
                enrichments: [{
                  type: 'company' as const,
                  status: 'skipped' as const,
                  companiesFound: 0,
                  dataPointsAdded: 0,
                  confidence: 0,
                  error: 'No company information available'
                }],
                overallConfidence: 0,
                processingTimeMs: 0
              };
            }
          } catch (error) {
            return {
              success: false,
              cardId: card.id,
              enrichments: [{
                type: 'company' as const,
                status: 'failed' as const,
                companiesFound: 0,
                dataPointsAdded: 0,
                confidence: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
              }],
              overallConfidence: 0,
              processingTimeMs: 0
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const successfulCards = results.filter(r => r.success).length;
      const failedCards = results.length - successfulCards;

      res.json({
        success: true,
        data: {
          totalCards: cards.length,
          processedCards: results.length,
          successfulCards,
          failedCards,
          results,
          overallProcessingTimeMs: Date.now() - startTime
        },
        message: `Batch enrichment completed: ${successfulCards} successful, ${failedCards} failed`
      });
    } catch (error) {
      console.error('Batch enrichment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during batch enrichment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;