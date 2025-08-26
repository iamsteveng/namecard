import { CardSearchDocument, CompanySearchDocument } from '@namecard/shared';
import { PrismaClient } from '@prisma/client';

import prisma from '../lib/prisma.js';
import type { IndexingService as IIndexingService } from '../types/search.types.js';
import logger from '../utils/logger.js';

import { searchService } from './search.service.js';

export class IndexingService implements IIndexingService {
  constructor(private db: PrismaClient = prisma) {}

  async indexCard(cardId: string): Promise<void> {
    try {
      const card = await this.db.card.findUnique({
        where: { id: cardId },
        include: {
          companies: {
            include: {
              company: true,
            },
          },
        },
      });

      if (!card) {
        logger.warn(`Card not found for indexing: ${cardId}`);
        return;
      }

      const searchDocument = this.transformCardToSearchDocument(card);
      await searchService.indexDocument(searchDocument);

      logger.debug(`Successfully indexed card: ${cardId}`);
    } catch (error) {
      logger.error(`Failed to index card ${cardId}:`, error);
      throw error;
    }
  }

  async indexCards(cardIds: string[]): Promise<void> {
    try {
      const cards = await this.db.card.findMany({
        where: { id: { in: cardIds } },
        include: {
          companies: {
            include: {
              company: true,
            },
          },
        },
      });

      const searchDocuments = cards.map(card => this.transformCardToSearchDocument(card));

      await searchService.indexDocuments(searchDocuments);

      logger.info(`Successfully indexed ${cards.length} cards`);
    } catch (error) {
      logger.error(`Failed to index cards [${cardIds.join(', ')}]:`, error);
      throw error;
    }
  }

  async indexCompany(companyId: string): Promise<void> {
    try {
      const company = await this.db.company.findUnique({
        where: { id: companyId },
        include: {
          cards: true,
        },
      });

      if (!company) {
        logger.warn(`Company not found for indexing: ${companyId}`);
        return;
      }

      const searchDocument = this.transformCompanyToSearchDocument(company);
      await searchService.indexDocument(searchDocument);

      logger.debug(`Successfully indexed company: ${companyId}`);
    } catch (error) {
      logger.error(`Failed to index company ${companyId}:`, error);
      throw error;
    }
  }

  async indexCompanies(companyIds: string[]): Promise<void> {
    try {
      const companies = await this.db.company.findMany({
        where: { id: { in: companyIds } },
        include: {
          cards: true,
        },
      });

      const searchDocuments = companies.map(company =>
        this.transformCompanyToSearchDocument(company)
      );

      await searchService.indexDocuments(searchDocuments);

      logger.info(`Successfully indexed ${companies.length} companies`);
    } catch (error) {
      logger.error(`Failed to index companies [${companyIds.join(', ')}]:`, error);
      throw error;
    }
  }

  async removeCard(cardId: string): Promise<void> {
    try {
      await searchService.removeDocument(cardId, 'idx:cards');
      logger.debug(`Successfully removed card from index: ${cardId}`);
    } catch (error) {
      logger.error(`Failed to remove card ${cardId} from index:`, error);
      throw error;
    }
  }

  async removeCompany(companyId: string): Promise<void> {
    try {
      await searchService.removeDocument(companyId, 'idx:companies');
      logger.debug(`Successfully removed company from index: ${companyId}`);
    } catch (error) {
      logger.error(`Failed to remove company ${companyId} from index:`, error);
      throw error;
    }
  }

  async reindexAll(): Promise<void> {
    logger.info('Starting full reindex...');

    try {
      // Get all cards and companies
      const [cards, companies] = await Promise.all([
        this.db.card.findMany({
          include: {
            companies: {
              include: {
                company: true,
              },
            },
          },
        }),
        this.db.company.findMany({
          include: {
            cards: true,
          },
        }),
      ]);

      // Transform to search documents
      const cardDocuments = cards.map(card => this.transformCardToSearchDocument(card));
      const companyDocuments = companies.map(company =>
        this.transformCompanyToSearchDocument(company)
      );

      // Index all documents
      await Promise.all([
        searchService.indexDocuments(cardDocuments),
        searchService.indexDocuments(companyDocuments),
      ]);

      logger.info(`Full reindex completed: ${cards.length} cards, ${companies.length} companies`);
    } catch (error) {
      logger.error('Full reindex failed:', error);
      throw error;
    }
  }

  async getIndexStats(): Promise<{
    cards: { total: number; lastIndexed: Date | null };
    companies: { total: number; lastIndexed: Date | null };
  }> {
    try {
      const [cardCount, companyCount] = await Promise.all([
        this.db.card.count(),
        this.db.company.count(),
      ]);

      // Get last indexed times (simplified - in a real implementation,
      // you might track this in a separate table)
      const [lastCardUpdate, lastCompanyUpdate] = await Promise.all([
        this.db.card.findFirst({
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.db.company.findFirst({
          orderBy: { lastUpdated: 'desc' },
          select: { lastUpdated: true },
        }),
      ]);

      return {
        cards: {
          total: cardCount,
          lastIndexed: lastCardUpdate?.updatedAt || null,
        },
        companies: {
          total: companyCount,
          lastIndexed: lastCompanyUpdate?.lastUpdated || null,
        },
      };
    } catch (error) {
      logger.error('Failed to get index stats:', error);
      throw error;
    }
  }

  private transformCardToSearchDocument(card: any): CardSearchDocument {
    // Build content for full-text search
    const contentParts = [
      card.name,
      card.title,
      card.company,
      card.extractedText,
      card.notes,
      card.email,
      card.phone,
      card.website,
      card.address,
    ].filter(Boolean);

    // Add company names from relationships
    const companyNames = card.companies?.map((cc: any) => cc.company?.name).filter(Boolean) || [];
    contentParts.push(...companyNames);

    return {
      id: card.id,
      type: 'card',
      title: card.name || card.company || card.title || 'Unnamed Card',
      content: contentParts.join(' '),
      metadata: {
        userId: card.userId,
        companyName: card.company,
        personName: card.name,
        email: card.email,
        phone: card.phone,
        website: card.website,
        address: card.address,
        jobTitle: card.title,
        tags: card.tags || [],
        enriched: (card.companies?.length || 0) > 0,
      },
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  private transformCompanyToSearchDocument(company: any): CompanySearchDocument {
    // Build content for full-text search
    const contentParts = [
      company.name,
      company.description,
      company.industry,
      company.location,
      company.website,
    ].filter(Boolean);

    return {
      id: company.id,
      type: 'company',
      title: company.name || 'Unnamed Company',
      content: contentParts.join(' '),
      metadata: {
        domain: company.domain || '',
        industry: company.industry,
        size: company.size,
        description: company.description,
        location: company.location,
        founded: company.founded ? parseInt(company.founded.toString()) : undefined,
        tags: [], // Companies don't have tags in current schema, but we include for consistency
        socialMedia: company.socialMedia ? JSON.parse(company.socialMedia) : undefined,
      },
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}

export const indexingService = new IndexingService();
