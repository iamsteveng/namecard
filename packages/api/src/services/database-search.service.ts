import { SearchQuery, SearchResponse, SearchResult } from '@namecard/shared';
import { PrismaClient } from '@prisma/client';

import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';

export class DatabaseSearchService {
  constructor(private db: PrismaClient = prisma) {}

  async search<T = any>(query: SearchQuery, indexName: string): Promise<SearchResponse<T>> {
    try {
      if (indexName.includes('cards')) {
        return (await this.searchCards(query)) as SearchResponse<T>;
      } else if (indexName.includes('companies')) {
        return (await this.searchCompanies(query)) as SearchResponse<T>;
      } else {
        throw new Error(`Unsupported index: ${indexName}`);
      }
    } catch (error) {
      logger.error(`Database search failed for query "${query.q}" in ${indexName}:`, error);
      throw error;
    }
  }

  private async searchCards(query: SearchQuery): Promise<SearchResponse<any>> {
    const startTime = Date.now();
    const searchTerm = query.q?.trim() || '';
    const limit = query.limit || 10;
    const offset = query.offset || 0;

    try {
      // Build search conditions
      const searchConditions: any = {};

      // Apply user filter if present
      const userFilter = query.filters?.find(f => f.field === 'metadata.userId');
      if (userFilter) {
        searchConditions.userId = userFilter.value;
      }

      // Full-text search across multiple fields
      let cards: any[] = [];
      let totalCount: number = 0;

      if (searchTerm) {
        // Use PostgreSQL full-text search with tsvector
        const searchQuery = `
          SELECT c.*, ts_rank(
            to_tsvector('english', 
              coalesce(c.name, '') || ' ' ||
              coalesce(c.title, '') || ' ' ||
              coalesce(c.company, '') || ' ' ||
              coalesce(c.email, '') || ' ' ||
              coalesce(c.phone, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              coalesce(c.address, '') || ' ' ||
              coalesce(c.notes, '') || ' ' ||
              array_to_string(c.tags, ' ')
            ),
            plainto_tsquery('english', $1)
          ) as rank
          FROM cards c
          WHERE ${userFilter ? 'c.user_id = $4 AND' : ''} 
            to_tsvector('english',
              coalesce(c.name, '') || ' ' ||
              coalesce(c.title, '') || ' ' ||
              coalesce(c.company, '') || ' ' ||
              coalesce(c.email, '') || ' ' ||
              coalesce(c.phone, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              coalesce(c.address, '') || ' ' ||
              coalesce(c.notes, '') || ' ' ||
              array_to_string(c.tags, ' ')
            ) @@ plainto_tsquery('english', $1)
          ORDER BY rank DESC, c.created_at DESC
          LIMIT $2 OFFSET $3
        `;

        const countQuery = `
          SELECT COUNT(*) as count
          FROM cards c
          WHERE ${userFilter ? 'c.user_id = $2 AND' : ''} 
            to_tsvector('english',
              coalesce(c.name, '') || ' ' ||
              coalesce(c.title, '') || ' ' ||
              coalesce(c.company, '') || ' ' ||
              coalesce(c.email, '') || ' ' ||
              coalesce(c.phone, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              coalesce(c.address, '') || ' ' ||
              coalesce(c.notes, '') || ' ' ||
              array_to_string(c.tags, ' ')
            ) @@ plainto_tsquery('english', $1)
        `;

        const params = userFilter
          ? [searchTerm, limit, offset, userFilter.value]
          : [searchTerm, limit, offset];

        const countParams = userFilter ? [searchTerm, userFilter.value] : [searchTerm];

        [cards, totalCount] = await Promise.all([
          this.db.$queryRawUnsafe(searchQuery, ...params) as Promise<any[]>,
          this.db
            .$queryRawUnsafe(countQuery, ...countParams)
            .then((result: any[]) => parseInt(result[0]?.count || '0')),
        ]);
      } else {
        // No search term - return all cards for the user with sorting
        const sortField = query.sort?.[0]?.field || 'createdAt';
        const sortDirection = query.sort?.[0]?.direction || 'DESC';

        const whereClause = userFilter ? { userId: userFilter.value } : {};

        [cards, totalCount] = await Promise.all([
          this.db.card.findMany({
            where: whereClause,
            orderBy: this.buildSortOrder(sortField, sortDirection),
            skip: offset,
            take: limit,
            include: {
              companies: {
                include: {
                  company: true,
                },
              },
            },
          }),
          this.db.card.count({ where: whereClause }),
        ]);
      }

      // Transform results to match Redis search format
      const results: SearchResult<any>[] = cards.map(card => ({
        id: card.id,
        score: card.rank || 1.0,
        document: this.transformCardDocument(card),
        highlights: searchTerm ? this.generateCardHighlights(card, searchTerm) : undefined,
      }));

      const took = Date.now() - startTime;

      logger.debug('Database card search completed', {
        query: searchTerm,
        totalResults: totalCount,
        returnedResults: results.length,
        took,
        userId: userFilter?.value,
      });

      return {
        results,
        total: totalCount,
        query: searchTerm,
        took,
      };
    } catch (error) {
      logger.error('Database card search failed:', error);
      throw error;
    }
  }

  private async searchCompanies(query: SearchQuery): Promise<SearchResponse<any>> {
    const startTime = Date.now();
    const searchTerm = query.q?.trim() || '';
    const limit = query.limit || 10;
    const offset = query.offset || 0;

    try {
      let companies: any[] = [];
      let totalCount: number = 0;

      if (searchTerm) {
        // Use PostgreSQL full-text search for companies
        const searchQuery = `
          SELECT c.*, ts_rank(
            to_tsvector('english', 
              coalesce(c.name, '') || ' ' ||
              coalesce(c.industry, '') || ' ' ||
              coalesce(c.description, '') || ' ' ||
              coalesce(c.location, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              array_to_string(c.keywords, ' ') || ' ' ||
              array_to_string(c.technologies, ' ')
            ),
            plainto_tsquery('english', $1)
          ) as rank
          FROM companies c
          WHERE to_tsvector('english',
              coalesce(c.name, '') || ' ' ||
              coalesce(c.industry, '') || ' ' ||
              coalesce(c.description, '') || ' ' ||
              coalesce(c.location, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              array_to_string(c.keywords, ' ') || ' ' ||
              array_to_string(c.technologies, ' ')
            ) @@ plainto_tsquery('english', $1)
          ORDER BY rank DESC, c.created_at DESC
          LIMIT $2 OFFSET $3
        `;

        const countQuery = `
          SELECT COUNT(*) as count
          FROM companies c
          WHERE to_tsvector('english',
              coalesce(c.name, '') || ' ' ||
              coalesce(c.industry, '') || ' ' ||
              coalesce(c.description, '') || ' ' ||
              coalesce(c.location, '') || ' ' ||
              coalesce(c.website, '') || ' ' ||
              array_to_string(c.keywords, ' ') || ' ' ||
              array_to_string(c.technologies, ' ')
            ) @@ plainto_tsquery('english', $1)
        `;

        [companies, totalCount] = await Promise.all([
          this.db.$queryRawUnsafe(searchQuery, searchTerm, limit, offset) as Promise<any[]>,
          this.db
            .$queryRawUnsafe(countQuery, searchTerm)
            .then((result: any[]) => parseInt(result[0]?.count || '0')),
        ]);
      } else {
        // No search term - return all companies with sorting
        const sortField = query.sort?.[0]?.field || 'createdAt';
        const sortDirection = query.sort?.[0]?.direction || 'DESC';

        [companies, totalCount] = await Promise.all([
          this.db.company.findMany({
            orderBy: this.buildSortOrder(sortField, sortDirection),
            skip: offset,
            take: limit,
          }),
          this.db.company.count(),
        ]);
      }

      // Transform results
      const results: SearchResult<any>[] = companies.map(company => ({
        id: company.id,
        score: company.rank || 1.0,
        document: this.transformCompanyDocument(company),
        highlights: searchTerm ? this.generateCompanyHighlights(company, searchTerm) : undefined,
      }));

      const took = Date.now() - startTime;

      logger.debug('Database company search completed', {
        query: searchTerm,
        totalResults: totalCount,
        returnedResults: results.length,
        took,
      });

      return {
        results,
        total: totalCount,
        query: searchTerm,
        took,
      };
    } catch (error) {
      logger.error('Database company search failed:', error);
      throw error;
    }
  }

  private transformCardDocument(card: any): any {
    return {
      id: card.id,
      type: 'card',
      title: card.name || card.company || card.title || 'Unnamed Card',
      content: [
        card.name,
        card.title,
        card.company,
        card.extractedText,
        card.notes,
        card.email,
        card.phone,
        card.website,
        card.address,
        card.tags?.join(' '),
      ]
        .filter(Boolean)
        .join(' '),
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
        enriched: card.companies?.length > 0,
      },
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  private transformCompanyDocument(company: any): any {
    return {
      id: company.id,
      type: 'company',
      title: company.name || 'Unnamed Company',
      content: [
        company.name,
        company.description,
        company.industry,
        company.location,
        company.website,
        company.keywords?.join(' '),
        company.technologies?.join(' '),
      ]
        .filter(Boolean)
        .join(' '),
      metadata: {
        domain: company.domain || '',
        industry: company.industry,
        size: company.size,
        description: company.description,
        location: company.location,
        founded: company.founded,
        tags: company.keywords || [],
      },
      createdAt: company.createdAt,
      updatedAt: company.lastUpdated,
    };
  }

  private generateCardHighlights(card: any, searchTerm: string): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};
    const term = searchTerm.toLowerCase();

    const fields = ['name', 'title', 'company', 'email', 'notes'];
    fields.forEach(field => {
      const value = card[field];
      if (value && typeof value === 'string' && value.toLowerCase().includes(term)) {
        highlights[field] = [this.highlightText(value, searchTerm)];
      }
    });

    return highlights;
  }

  private generateCompanyHighlights(company: any, searchTerm: string): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};
    const term = searchTerm.toLowerCase();

    const fields = ['name', 'description', 'industry', 'location'];
    fields.forEach(field => {
      const value = company[field];
      if (value && typeof value === 'string' && value.toLowerCase().includes(term)) {
        highlights[field] = [this.highlightText(value, searchTerm)];
      }
    });

    return highlights;
  }

  private highlightText(text: string, searchTerm: string): string {
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private buildSortOrder(field: string, direction: string): any {
    const sortMap: Record<string, string> = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      name: 'name',
      company: 'company',
      title: 'title',
      email: 'email',
    };

    const dbField = sortMap[field] || 'createdAt';
    return { [dbField]: direction.toLowerCase() };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      // Test database connection
      await this.db.$queryRaw`SELECT 1`;

      // Test a simple search
      await this.search({ q: 'test', limit: 1 }, 'idx:cards');

      return {
        status: 'healthy',
        details: {
          database: 'connected',
          searchTest: 'passed',
        },
      };
    } catch (error) {
      logger.error('Database search health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          database: 'disconnected',
        },
      };
    }
  }
}

export const databaseSearchService = new DatabaseSearchService();
