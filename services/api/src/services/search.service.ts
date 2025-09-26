/**
 * PostgreSQL Full-Text Search Service
 * Provides high-performance search capabilities using PostgreSQL's tsvector/tsquery
 */

import type { Card } from '@namecard/shared/types/card.types';
import type { Company } from '@namecard/shared/types/company.types';
import type {
  FullTextSearchParams,
  AdvancedSearchParams,
  SearchResultItem,
  SearchResults,
  SearchSuggestion,
  SearchSuggestionParams,
  SearchAnalytics,
} from '@namecard/shared/types/search.types';
import type { PrismaClient } from '@prisma/client';

import logger from '../utils/logger.js';
import {
  processQueryByMode,
  buildAdvancedQuery,
  buildPrefixQuery,
  validateSearchParams,
  extractSearchTerms,
  calculateQueryComplexity,
  SearchQueryError,
} from '../utils/search.utils.js';

// Enhanced error tracking and monitoring
interface SearchMetrics {
  totalQueries: number;
  averageExecutionTime: number;
  slowQueries: Array<{ query: string; executionTime: number; timestamp: Date }>;
  errorCount: number;
  lastErrors: Array<{ error: string; query: string; timestamp: Date }>;
}

class SearchMonitor {
  private metrics: SearchMetrics = {
    totalQueries: 0,
    averageExecutionTime: 0,
    slowQueries: [],
    errorCount: 0,
    lastErrors: [],
  };

  recordQuery(executionTime: number, query: string) {
    this.metrics.totalQueries++;

    // Update average execution time
    const totalTime =
      this.metrics.averageExecutionTime * (this.metrics.totalQueries - 1) + executionTime;
    this.metrics.averageExecutionTime = totalTime / this.metrics.totalQueries;

    // Record slow queries (>1000ms)
    if (executionTime > 1000) {
      this.metrics.slowQueries.push({
        query: query.substring(0, 100), // Limit length
        executionTime,
        timestamp: new Date(),
      });

      // Keep only last 10 slow queries
      if (this.metrics.slowQueries.length > 10) {
        this.metrics.slowQueries.shift();
      }

      logger.warn('Slow search query detected', {
        query: query.substring(0, 100),
        executionTime,
        service: 'SearchService',
      });
    }
  }

  recordError(error: Error, query: string) {
    this.metrics.errorCount++;
    this.metrics.lastErrors.push({
      error: error.message,
      query: query.substring(0, 100),
      timestamp: new Date(),
    });

    // Keep only last 10 errors
    if (this.metrics.lastErrors.length > 10) {
      this.metrics.lastErrors.shift();
    }

    logger.error('Search query error', {
      error: error.message,
      stack: error.stack,
      query: query.substring(0, 100),
      service: 'SearchService',
    });
  }

  getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      totalQueries: 0,
      averageExecutionTime: 0,
      slowQueries: [],
      errorCount: 0,
      lastErrors: [],
    };
  }
}

const searchMonitor = new SearchMonitor();

export class SearchService {
  constructor(private prisma: PrismaClient) {}

  // =============================================================================
  // CARD SEARCH METHODS
  // =============================================================================

  /**
   * Searches cards using PostgreSQL full-text search
   */
  async searchCards(params: FullTextSearchParams, userId: string): Promise<SearchResults<Card>> {
    const startTime = Date.now();

    try {
      // Validate parameters
      validateSearchParams(params);

      const {
        q = '',
        page = 1,
        limit = 20,
        searchMode = 'simple',
        highlight = false,
        includeRank = true,
        minRank = 0,
        tags,
        company,
        dateFrom,
        dateTo,
      } = params;

      // Build the full-text search query
      const searchQuery = processQueryByMode(q, searchMode);

      if (!searchQuery && !tags && !company && !dateFrom && !dateTo) {
        // No search criteria provided, return empty results
        return this.buildEmptySearchResults<Card>(
          'No search criteria provided',
          q,
          searchMode,
          Date.now() - startTime
        );
      }

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(Math.max(1, Number(limit)), 100);
      const offset = (pageNum - 1) * limitNum;

      // Build the base query
      let whereClause = `WHERE c.user_id = $1::uuid`;
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      // Add full-text search condition
      if (searchQuery) {
        whereClause += ` AND c.search_vector @@ to_tsquery('english', $${paramIndex})`;
        queryParams.push(searchQuery);
        paramIndex++;
      }

      // Add traditional filters
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        whereClause += ` AND c.tags && $${paramIndex}`;
        queryParams.push(tagArray);
        paramIndex++;
      }

      if (company) {
        whereClause += ` AND c.company ILIKE $${paramIndex}`;
        queryParams.push(`%${company}%`);
        paramIndex++;
      }

      if (dateFrom) {
        whereClause += ` AND c.created_at >= $${paramIndex}`;
        queryParams.push(new Date(dateFrom));
        paramIndex++;
      }

      if (dateTo) {
        whereClause += ` AND c.created_at <= $${paramIndex}`;
        queryParams.push(new Date(dateTo));
        paramIndex++;
      }

      // Add minimum rank filter
      if (searchQuery && minRank > 0) {
        whereClause += ` AND ts_rank(c.search_vector, to_tsquery('english', $2)) >= $${paramIndex}`;
        queryParams.push(minRank);
        paramIndex++;
      }

      // Build SELECT clause with optional ranking and highlighting
      let selectClause = `
        c.id, c.user_id, c.first_name, c.last_name, c.title, c.company, c.department,
        c.email, c.phone, c.mobile, c.address, c.website, c.notes, c.tags,
        c.original_image_url, c.processed_image_url, c.ocr_confidence,
        c.created_at, c.updated_at
      `;

      if (searchQuery && includeRank) {
        selectClause += `, ts_rank(c.search_vector, to_tsquery('english', $2)) as search_rank`;
      }

      if (searchQuery && highlight) {
        selectClause += `, ts_headline('english', 
          COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') || ' ' || 
          COALESCE(c.title, '') || ' ' || COALESCE(c.company, ''),
          to_tsquery('english', $2)
        ) as highlight`;
      }

      // Build ORDER BY clause
      let orderByClause = '';
      if (searchQuery && includeRank) {
        orderByClause = 'ORDER BY search_rank DESC, c.created_at DESC';
      } else {
        orderByClause = 'ORDER BY c.created_at DESC';
      }

      // Execute the search query
      const searchSql = `
        SELECT ${selectClause}
        FROM cards c
        ${whereClause}
        ${orderByClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limitNum, offset);

      const results = await this.prisma.$queryRawUnsafe(searchSql, ...queryParams);

      // Execute count query
      const countSql = `
        SELECT COUNT(*) as total
        FROM cards c
        ${whereClause}
      `;

      const countResult = (await this.prisma.$queryRawUnsafe(
        countSql,
        ...queryParams.slice(0, -2) // Remove limit and offset
      )) as [{ total: bigint }];

      const total = Number(countResult[0].total);

      // Process results
      const searchResults = await this.processCardResults(results as any[], {
        highlight,
        includeRank,
        searchQuery,
      });

      const executionTime = Date.now() - startTime;

      // Log search analytics
      // Record successful query metrics
      searchMonitor.recordQuery(executionTime, q || 'empty-query');

      if (q) {
        await this.logSearchAnalytics({
          query: q,
          userId,
          searchMode,
          resultCount: searchResults.length,
          executionTime,
        });
      }

      return {
        success: true,
        data: {
          results: searchResults,
          searchMeta: {
            query: q,
            processedQuery: searchQuery,
            executionTime: `${executionTime}ms`,
            totalMatches: total,
            searchMode,
            hasMore: pageNum * limitNum < total,
          },
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1,
          },
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Record error metrics
      searchMonitor.recordError(error as Error, params.q || 'empty-query');

      logger.error('Card search error:', { error, params, userId, executionTime });

      if (error instanceof SearchQueryError) {
        throw error;
      }

      throw new SearchQueryError('Internal search error occurred', 'SEARCH_ERROR', {
        executionTime,
        originalError: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Advanced card search with complex boolean queries
   */
  async advancedSearchCards(
    params: AdvancedSearchParams,
    userId: string
  ): Promise<SearchResults<Card>> {
    const searchQuery = buildAdvancedQuery(params);

    return this.searchCards(
      {
        ...params,
        q: searchQuery,
        searchMode: 'advanced',
      },
      userId
    );
  }

  // =============================================================================
  // COMPANY SEARCH METHODS
  // =============================================================================

  /**
   * Searches companies using PostgreSQL full-text search
   */
  async searchCompanies(params: FullTextSearchParams): Promise<SearchResults<Company>> {
    const startTime = Date.now();

    try {
      validateSearchParams(params);

      const {
        q = '',
        page = 1,
        limit = 20,
        searchMode = 'simple',
        highlight = false,
        includeRank = true,
        minRank = 0,
      } = params;

      const searchQuery = processQueryByMode(q, searchMode);

      if (!searchQuery) {
        return this.buildEmptySearchResults<Company>(
          'No search query provided',
          q,
          searchMode,
          Date.now() - startTime
        );
      }

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(Math.max(1, Number(limit)), 100);
      const offset = (pageNum - 1) * limitNum;

      // Build SELECT clause
      let selectClause = `
        id, name, domain, industry, description, size, headquarters, 
        website, logo_url, founded_year, created_at, updated_at
      `;

      if (includeRank) {
        selectClause += `, ts_rank(search_vector, to_tsquery('english', $1)) as search_rank`;
      }

      if (highlight) {
        selectClause += `, ts_headline('english',
          name || ' ' || COALESCE(industry, '') || ' ' || COALESCE(description, ''),
          to_tsquery('english', $1)
        ) as highlight`;
      }

      // Build WHERE clause
      let whereClause = `WHERE search_vector @@ to_tsquery('english', $1)`;
      if (minRank > 0) {
        whereClause += ` AND ts_rank(search_vector, to_tsquery('english', $1)) >= $2`;
      }

      // Build ORDER BY clause
      const orderByClause = includeRank
        ? 'ORDER BY search_rank DESC, created_at DESC'
        : 'ORDER BY created_at DESC';

      // Execute search query
      const searchSql = `
        SELECT ${selectClause}
        FROM companies
        ${whereClause}
        ${orderByClause}
        LIMIT $${minRank > 0 ? 3 : 2} OFFSET $${minRank > 0 ? 4 : 3}
      `;

      const queryParams: (string | number)[] = [searchQuery];
      if (minRank > 0) {
        queryParams.push(minRank);
      }
      queryParams.push(limitNum, offset);

      const results = await this.prisma.$queryRawUnsafe(searchSql, ...queryParams);

      // Execute count query
      const countSql = `
        SELECT COUNT(*) as total
        FROM companies
        ${whereClause}
      `;

      const countParams: (string | number)[] = [searchQuery];
      if (minRank > 0) {
        countParams.push(minRank);
      }

      const countResult = (await this.prisma.$queryRawUnsafe(countSql, ...countParams)) as [
        { total: bigint },
      ];
      const total = Number(countResult[0].total);

      // Process results
      const searchResults = await this.processCompanyResults(results as any[], {
        highlight,
        includeRank,
        searchQuery,
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          results: searchResults,
          searchMeta: {
            query: q,
            processedQuery: searchQuery,
            executionTime: `${executionTime}ms`,
            totalMatches: total,
            searchMode,
            hasMore: pageNum * limitNum < total,
          },
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1,
          },
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Company search error:', { error, params, executionTime });

      if (error instanceof SearchQueryError) {
        throw error;
      }

      throw new SearchQueryError('Internal search error occurred', 'SEARCH_ERROR', {
        executionTime,
        originalError: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  // =============================================================================
  // SEARCH SUGGESTIONS & AUTOCOMPLETE
  // =============================================================================

  /**
   * Get search suggestions for autocomplete
   */
  async getSearchSuggestions(
    params: SearchSuggestionParams,
    userId?: string
  ): Promise<SearchSuggestion[]> {
    const startTime = Date.now();

    try {
      const { prefix, type, maxSuggestions = 10 } = params;

      if (!prefix || prefix.length < 2) {
        return [];
      }

      const prefixQuery = buildPrefixQuery(prefix);
      if (!prefixQuery) {
        return [];
      }

      const suggestions: SearchSuggestion[] = [];

      // Get suggestions based on type
      switch (type) {
        case 'name':
          await this.addNameSuggestions(prefixQuery, suggestions, userId, maxSuggestions);
          break;
        case 'company':
          await this.addCompanySuggestions(prefixQuery, suggestions, userId, maxSuggestions);
          break;
        case 'title':
          await this.addTitleSuggestions(prefixQuery, suggestions, userId, maxSuggestions);
          break;
        default:
          // Get mixed suggestions
          await Promise.all([
            this.addNameSuggestions(
              prefixQuery,
              suggestions,
              userId,
              Math.ceil(maxSuggestions / 3)
            ),
            this.addCompanySuggestions(
              prefixQuery,
              suggestions,
              userId,
              Math.ceil(maxSuggestions / 3)
            ),
            this.addTitleSuggestions(
              prefixQuery,
              suggestions,
              userId,
              Math.ceil(maxSuggestions / 3)
            ),
          ]);
      }

      // Sort by score and limit results
      const sortedSuggestions = suggestions
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, maxSuggestions);

      const executionTime = Date.now() - startTime;
      logger.debug('Search suggestions generated:', {
        prefix,
        type,
        count: sortedSuggestions.length,
        executionTime,
      });

      return sortedSuggestions;
    } catch (error) {
      logger.error('Search suggestions error:', { error, params });
      return [];
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async processCardResults(
    rawResults: any[],
    options: { highlight?: boolean; includeRank?: boolean; searchQuery?: string }
  ): Promise<SearchResultItem<Card>[]> {
    return rawResults.map(row => {
      // Build card object
      const card: Card = {
        id: row.id,
        userId: row.user_id,
        originalImageUrl: row.original_image_url,
        processedImageUrl: row.processed_image_url,
        extractedText: null,
        confidence: row.ocr_confidence,
        name:
          row.first_name && row.last_name
            ? `${row.first_name} ${row.last_name}`
            : row.first_name || row.last_name || undefined,
        title: row.title,
        company: row.company,
        email: row.email,
        phone: row.phone || row.mobile,
        address: row.address,
        website: row.website,
        notes: row.notes,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      const result: SearchResultItem<Card> = {
        item: card,
        rank: row.search_rank || 0,
      };

      // Add highlights if requested
      if (options.highlight && row.highlight) {
        result.highlights = [
          {
            field: 'combined',
            value: row.highlight,
          },
        ];
      }

      // Add matched fields (simplified - would need more complex logic for real field matching)
      if (options.searchQuery) {
        result.matchedFields = this.getMatchedFields(card, options.searchQuery);
      }

      return result;
    });
  }

  private async processCompanyResults(
    rawResults: any[],
    options: { highlight?: boolean; includeRank?: boolean; searchQuery?: string }
  ): Promise<SearchResultItem<Company>[]> {
    return rawResults.map(row => {
      const company: Company = {
        id: row.id,
        name: row.name,
        industry: row.industry,
        description: row.description,
        size: row.size,
        headquarters: row.headquarters,
        website: row.website,
        logoUrl: row.logo_url,
        lastUpdated: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      const result: SearchResultItem<Company> = {
        item: company,
        rank: row.search_rank || 0,
      };

      if (options.highlight && row.highlight) {
        result.highlights = [
          {
            field: 'combined',
            value: row.highlight,
          },
        ];
      }

      if (options.searchQuery) {
        result.matchedFields = this.getMatchedCompanyFields(company, options.searchQuery);
      }

      return result;
    });
  }

  private getMatchedFields(card: Card, searchQuery: string): string[] {
    const fields: string[] = [];
    const terms = extractSearchTerms(searchQuery);

    terms.forEach(term => {
      const lowerTerm = term.toLowerCase();
      if (card.name?.toLowerCase().includes(lowerTerm)) {
        fields.push('name');
      }
      if (card.title?.toLowerCase().includes(lowerTerm)) {
        fields.push('title');
      }
      if (card.company?.toLowerCase().includes(lowerTerm)) {
        fields.push('company');
      }
      if (card.email?.toLowerCase().includes(lowerTerm)) {
        fields.push('email');
      }
      if (card.notes?.toLowerCase().includes(lowerTerm)) {
        fields.push('notes');
      }
    });

    return Array.from(new Set(fields));
  }

  private getMatchedCompanyFields(company: Company, searchQuery: string): string[] {
    const fields: string[] = [];
    const terms = extractSearchTerms(searchQuery);

    terms.forEach(term => {
      const lowerTerm = term.toLowerCase();
      if (company.name?.toLowerCase().includes(lowerTerm)) {
        fields.push('name');
      }
      if (company.industry?.toLowerCase().includes(lowerTerm)) {
        fields.push('industry');
      }
      if (company.description?.toLowerCase().includes(lowerTerm)) {
        fields.push('description');
      }
      if (company.website?.toLowerCase().includes(lowerTerm)) {
        fields.push('website');
      }
    });

    return Array.from(new Set(fields));
  }

  private async addNameSuggestions(
    prefixQuery: string,
    suggestions: SearchSuggestion[],
    userId?: string,
    limit: number = 5
  ): Promise<void> {
    let whereClause = `WHERE (
      first_name ILIKE $1 OR last_name ILIKE $1 OR 
      (first_name || ' ' || last_name) ILIKE $1
    )`;
    const queryParams = [`${prefixQuery.replace(':*', '')}%`];

    if (userId) {
      whereClause += ` AND user_id = $2::uuid`;
      queryParams.push(userId);
    }

    const sql = `
      SELECT 
        DISTINCT CASE 
          WHEN first_name ILIKE $1 THEN first_name
          WHEN last_name ILIKE $1 THEN last_name  
          ELSE first_name || ' ' || last_name
        END as suggestion,
        COUNT(*) as count
      FROM cards
      ${whereClause}
      GROUP BY suggestion
      ORDER BY count DESC, suggestion
      LIMIT ${limit}
    `;

    const results = (await this.prisma.$queryRawUnsafe(sql, ...queryParams)) as Array<{
      suggestion: string;
      count: bigint;
    }>;

    results.forEach(row => {
      if (row.suggestion) {
        suggestions.push({
          text: row.suggestion,
          type: 'name',
          count: Number(row.count),
          score: Number(row.count) * 0.8, // Name matches get high score
        });
      }
    });
  }

  private async addCompanySuggestions(
    prefixQuery: string,
    suggestions: SearchSuggestion[],
    userId?: string,
    limit: number = 5
  ): Promise<void> {
    let whereClause = `WHERE company ILIKE $1`;
    const queryParams = [`${prefixQuery.replace(':*', '')}%`];

    if (userId) {
      whereClause += ` AND user_id = $2::uuid`;
      queryParams.push(userId);
    }

    const sql = `
      SELECT company as suggestion, COUNT(*) as count
      FROM cards
      ${whereClause}
      GROUP BY company
      ORDER BY count DESC, company
      LIMIT ${limit}
    `;

    const results = (await this.prisma.$queryRawUnsafe(sql, ...queryParams)) as Array<{
      suggestion: string;
      count: bigint;
    }>;

    results.forEach(row => {
      if (row.suggestion) {
        suggestions.push({
          text: row.suggestion,
          type: 'company',
          count: Number(row.count),
          score: Number(row.count) * 0.7,
        });
      }
    });
  }

  private async addTitleSuggestions(
    prefixQuery: string,
    suggestions: SearchSuggestion[],
    userId?: string,
    limit: number = 5
  ): Promise<void> {
    let whereClause = `WHERE title ILIKE $1`;
    const queryParams = [`${prefixQuery.replace(':*', '')}%`];

    if (userId) {
      whereClause += ` AND user_id = $2::uuid`;
      queryParams.push(userId);
    }

    const sql = `
      SELECT title as suggestion, COUNT(*) as count
      FROM cards
      ${whereClause}
      GROUP BY title
      ORDER BY count DESC, title
      LIMIT ${limit}
    `;

    const results = (await this.prisma.$queryRawUnsafe(sql, ...queryParams)) as Array<{
      suggestion: string;
      count: bigint;
    }>;

    results.forEach(row => {
      if (row.suggestion) {
        suggestions.push({
          text: row.suggestion,
          type: 'title',
          count: Number(row.count),
          score: Number(row.count) * 0.6,
        });
      }
    });
  }

  private buildEmptySearchResults<T>(
    message: string,
    query: string,
    searchMode: string,
    executionTime: number
  ): SearchResults<T> {
    return {
      success: true,
      data: {
        results: [],
        searchMeta: {
          query,
          processedQuery: '',
          executionTime: `${executionTime}ms`,
          totalMatches: 0,
          searchMode: searchMode as any,
          hasMore: false,
        },
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    };
  }

  private async logSearchAnalytics(
    analytics: Omit<SearchAnalytics, 'queryId' | 'timestamp'>
  ): Promise<void> {
    try {
      // In a real implementation, you might store this in a dedicated analytics table
      // For now, we'll just log it
      logger.info('Search analytics', {
        ...analytics,
        queryId: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        complexity: calculateQueryComplexity(analytics.query),
        terms: extractSearchTerms(analytics.query),
      });
    } catch (error) {
      logger.warn('Failed to log search analytics:', error);
    }
  }

  // =============================================================================
  // MONITORING & METRICS
  // =============================================================================

  /**
   * Get search performance metrics
   */
  getSearchMetrics(): SearchMetrics {
    return searchMonitor.getMetrics();
  }

  /**
   * Reset search metrics (useful for testing or periodic resets)
   */
  resetSearchMetrics(): void {
    searchMonitor.reset();
  }

  /**
   * Get search system health status
   */
  async getSearchHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: SearchMetrics;
    database: {
      connected: boolean;
      responseTime?: number;
    };
    indexes: {
      cardsIndexed: number;
      companiesIndexed: number;
    };
  }> {
    const startTime = Date.now();
    let dbConnected = false;
    let dbResponseTime: number | undefined;
    let cardsIndexed = 0;
    let companiesIndexed = 0;

    try {
      // Test database connectivity and get index health
      const healthCheck = await Promise.all([
        this.prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT COUNT(*) as count FROM cards WHERE search_vector IS NOT NULL`,
        this.prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT COUNT(*) as count FROM companies WHERE search_vector IS NOT NULL`,
      ]);

      cardsIndexed = Number(healthCheck[0][0].count);
      companiesIndexed = Number(healthCheck[1][0].count);
      dbConnected = true;
      dbResponseTime = Date.now() - startTime;
    } catch (error) {
      logger.error('Search health check failed:', error);
    }

    const metrics = this.getSearchMetrics();

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!dbConnected) {
      status = 'unhealthy';
    } else if (
      metrics.averageExecutionTime > 1000 ||
      metrics.errorCount > 10 ||
      (dbResponseTime && dbResponseTime > 2000)
    ) {
      status = 'degraded';
    }

    return {
      status,
      metrics,
      database: {
        connected: dbConnected,
        responseTime: dbResponseTime,
      },
      indexes: {
        cardsIndexed,
        companiesIndexed,
      },
    };
  }
}
