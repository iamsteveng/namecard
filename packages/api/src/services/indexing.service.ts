/**
 * Search Index Management Service
 * Handles search vector updates, validation, and health monitoring
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IndexHealth,
  IndexingJob,
} from '@namecard/shared/types/search.types';

import logger from '../utils/logger.js';

export class IndexingService {
  constructor(private prisma: PrismaClient) {}

  // =============================================================================
  // INDEX HEALTH MONITORING
  // =============================================================================

  /**
   * Check the health and completeness of search indexes
   */
  async getIndexHealth(): Promise<IndexHealth[]> {
    const results: IndexHealth[] = [];

    try {
      // Check cards table index health
      const cardsHealth = await this.getTableIndexHealth('cards');
      results.push(cardsHealth);

      // Check companies table index health
      const companiesHealth = await this.getTableIndexHealth('companies');
      results.push(companiesHealth);

      logger.info('Index health check completed', { results });
      return results;
    } catch (error) {
      logger.error('Index health check failed:', error);
      throw new Error('Failed to check index health');
    }
  }

  /**
   * Get index health for a specific table
   */
  private async getTableIndexHealth(tableName: 'cards' | 'companies'): Promise<IndexHealth> {
    // Get total records count
    const totalRecordsResult = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total FROM ${tableName}`
    ) as [{ total: bigint }];
    const totalRecords = Number(totalRecordsResult[0].total);

    // Get indexed records count (non-null search_vector)
    const indexedRecordsResult = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as indexed FROM ${tableName} WHERE search_vector IS NOT NULL`
    ) as [{ total: bigint }];
    const indexedRecords = Number(indexedRecordsResult[0].total || 0);

    // Get index size
    const indexSizeResult = await this.prisma.$queryRawUnsafe(
      `SELECT pg_size_pretty(pg_relation_size($1)) as size`,
      `${tableName}_search_vector_idx`
    ) as [{ size: string }];
    const indexSize = indexSizeResult[0]?.size || '0 bytes';

    // Get last updated timestamp (approximate using the most recent record)
    const lastUpdatedResult = await this.prisma.$queryRawUnsafe(
      `SELECT MAX(updated_at) as last_updated FROM ${tableName} WHERE search_vector IS NOT NULL`
    ) as [{ last_updated: Date | null }];
    const lastUpdated = lastUpdatedResult[0]?.last_updated || new Date(0);

    const completeness = totalRecords > 0 ? (indexedRecords / totalRecords) * 100 : 100;

    return {
      tableName,
      totalRecords,
      indexedRecords,
      completeness: Math.round(completeness * 100) / 100,
      lastUpdated,
      indexSize,
    };
  }

  // =============================================================================
  // MANUAL INDEX UPDATES
  // =============================================================================

  /**
   * Force update search vectors for specific card IDs
   */
  async updateCardSearchVectors(cardIds: string[]): Promise<{ updated: number; failed: string[] }> {
    const failed: string[] = [];
    let updated = 0;

    logger.info('Starting manual card search vector update', { cardIds: cardIds.length });

    for (const cardId of cardIds) {
      try {
        // Trigger the search vector update by doing a dummy update
        await this.prisma.$queryRawUnsafe(
          `UPDATE cards 
           SET updated_at = updated_at 
           WHERE id = $1`,
          cardId
        );
        updated++;
      } catch (error) {
        logger.warn('Failed to update search vector for card:', { cardId, error });
        failed.push(cardId);
      }
    }

    logger.info('Card search vector update completed', { updated, failed: failed.length });
    return { updated, failed };
  }

  /**
   * Force update search vectors for specific company IDs
   */
  async updateCompanySearchVectors(companyIds: string[]): Promise<{ updated: number; failed: string[] }> {
    const failed: string[] = [];
    let updated = 0;

    logger.info('Starting manual company search vector update', { companyIds: companyIds.length });

    for (const companyId of companyIds) {
      try {
        await this.prisma.$queryRawUnsafe(
          `UPDATE companies 
           SET updated_at = updated_at 
           WHERE id = $1`,
          companyId
        );
        updated++;
      } catch (error) {
        logger.warn('Failed to update search vector for company:', { companyId, error });
        failed.push(companyId);
      }
    }

    logger.info('Company search vector update completed', { updated, failed: failed.length });
    return { updated, failed };
  }

  // =============================================================================
  // BULK REINDEXING
  // =============================================================================

  /**
   * Perform full reindexing of all cards
   */
  async reindexAllCards(): Promise<IndexingJob> {
    const jobId = `reindex_cards_${Date.now()}`;
    const job: IndexingJob = {
      id: jobId,
      tableName: 'cards',
      operation: 'full_reindex',
      status: 'running',
      progress: 0,
      startTime: new Date(),
      recordsProcessed: 0,
    };

    try {
      logger.info('Starting full cards reindex', { jobId });

      // Get total count
      const totalResult = await this.prisma.$queryRawUnsafe(
        'SELECT COUNT(*) as total FROM cards'
      ) as [{ total: bigint }];
      const total = Number(totalResult[0].total);

      // Update all cards in batches
      const batchSize = 1000;
      let processed = 0;

      for (let offset = 0; offset < total; offset += batchSize) {
        const batchResult = await this.prisma.$queryRawUnsafe(
          `UPDATE cards 
           SET updated_at = updated_at 
           WHERE id IN (
             SELECT id FROM cards 
             ORDER BY created_at 
             LIMIT $1 OFFSET $2
           )`,
          batchSize,
          offset
        );

        processed += batchSize;
        job.progress = Math.min((processed / total) * 100, 100);
        job.recordsProcessed = Math.min(processed, total);

        logger.debug('Reindex progress', { 
          jobId, 
          processed: job.recordsProcessed, 
          total, 
          progress: job.progress 
        });
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.recordsProcessed = total;
      job.progress = 100;

      logger.info('Cards reindex completed successfully', { jobId, recordsProcessed: total });
      return job;

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Cards reindex failed', { jobId, error });
      return job;
    }
  }

  /**
   * Perform full reindexing of all companies
   */
  async reindexAllCompanies(): Promise<IndexingJob> {
    const jobId = `reindex_companies_${Date.now()}`;
    const job: IndexingJob = {
      id: jobId,
      tableName: 'companies',
      operation: 'full_reindex',
      status: 'running',
      progress: 0,
      startTime: new Date(),
      recordsProcessed: 0,
    };

    try {
      logger.info('Starting full companies reindex', { jobId });

      const totalResult = await this.prisma.$queryRawUnsafe(
        'SELECT COUNT(*) as total FROM companies'
      ) as [{ total: bigint }];
      const total = Number(totalResult[0].total);

      const batchSize = 1000;
      let processed = 0;

      for (let offset = 0; offset < total; offset += batchSize) {
        await this.prisma.$queryRawUnsafe(
          `UPDATE companies 
           SET updated_at = updated_at 
           WHERE id IN (
             SELECT id FROM companies 
             ORDER BY created_at 
             LIMIT $1 OFFSET $2
           )`,
          batchSize,
          offset
        );

        processed += batchSize;
        job.progress = Math.min((processed / total) * 100, 100);
        job.recordsProcessed = Math.min(processed, total);

        logger.debug('Company reindex progress', { 
          jobId, 
          processed: job.recordsProcessed, 
          total, 
          progress: job.progress 
        });
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.recordsProcessed = total;
      job.progress = 100;

      logger.info('Companies reindex completed successfully', { jobId, recordsProcessed: total });
      return job;

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Companies reindex failed', { jobId, error });
      return job;
    }
  }

  // =============================================================================
  // SEARCH VECTOR VALIDATION
  // =============================================================================

  /**
   * Validate search vector integrity and consistency
   */
  async validateSearchVectors(tableName: 'cards' | 'companies'): Promise<{
    valid: number;
    invalid: number;
    missing: number;
    details: Array<{ id: string; issue: string }>;
  }> {
    const issues: Array<{ id: string; issue: string }> = [];
    let valid = 0;
    let invalid = 0;
    let missing = 0;

    try {
      logger.info('Starting search vector validation', { tableName });

      // Check for missing search vectors
      const missingVectorsResult = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${tableName} WHERE search_vector IS NULL`
      ) as Array<{ id: string }>;

      missing = missingVectorsResult.length;
      missingVectorsResult.forEach(row => {
        issues.push({ id: row.id, issue: 'missing_search_vector' });
      });

      // Check for empty search vectors
      const emptyVectorsResult = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${tableName} WHERE search_vector IS NOT NULL AND search_vector = ''::tsvector`
      ) as Array<{ id: string }>;

      invalid += emptyVectorsResult.length;
      emptyVectorsResult.forEach(row => {
        issues.push({ id: row.id, issue: 'empty_search_vector' });
      });

      // Get total records with valid search vectors
      const validVectorsResult = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM ${tableName} 
         WHERE search_vector IS NOT NULL AND search_vector != ''::tsvector`
      ) as [{ count: bigint }];

      valid = Number(validVectorsResult[0].count);

      logger.info('Search vector validation completed', { 
        tableName, 
        valid, 
        invalid, 
        missing, 
        totalIssues: issues.length 
      });

      return { valid, invalid, missing, details: issues };

    } catch (error) {
      logger.error('Search vector validation failed', { tableName, error });
      throw new Error(`Failed to validate search vectors for ${tableName}`);
    }
  }

  // =============================================================================
  // TRIGGER FUNCTION VALIDATION
  // =============================================================================

  /**
   * Validate that search vector trigger functions are working correctly
   */
  async validateTriggerFunctions(): Promise<{
    cardsTriggersWorking: boolean;
    companiesTriggersWorking: boolean;
    details: string[];
  }> {
    const details: string[] = [];
    let cardsTriggersWorking = false;
    let companiesTriggersWorking = false;

    try {
      // Test cards trigger
      const testCardId = `test_${Date.now()}`;
      
      // Create a test card and check if search vector is populated
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO cards (id, user_id, first_name, last_name, title, company, updated_at)
         VALUES ($1, $2, 'Test', 'User', 'Test Engineer', 'Test Corp', NOW())`,
        testCardId,
        'test-user-id'
      );

      // Check if search vector was created
      const cardVectorResult = await this.prisma.$queryRawUnsafe(
        `SELECT search_vector FROM cards WHERE id = $1`,
        testCardId
      ) as [{ search_vector: string | null }];

      if (cardVectorResult[0]?.search_vector) {
        cardsTriggersWorking = true;
        details.push('Cards trigger function is working correctly');
      } else {
        details.push('Cards trigger function is NOT working - search_vector not populated');
      }

      // Clean up test card
      await this.prisma.$queryRawUnsafe('DELETE FROM cards WHERE id = $1', testCardId);

      // Test companies trigger
      const testCompanyId = `test_company_${Date.now()}`;
      
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO companies (id, name, industry, description, updated_at)
         VALUES ($1, 'Test Company', 'Technology', 'Test company for trigger validation', NOW())`,
        testCompanyId
      );

      const companyVectorResult = await this.prisma.$queryRawUnsafe(
        `SELECT search_vector FROM companies WHERE id = $1`,
        testCompanyId
      ) as [{ search_vector: string | null }];

      if (companyVectorResult[0]?.search_vector) {
        companiesTriggersWorking = true;
        details.push('Companies trigger function is working correctly');
      } else {
        details.push('Companies trigger function is NOT working - search_vector not populated');
      }

      // Clean up test company
      await this.prisma.$queryRawUnsafe('DELETE FROM companies WHERE id = $1', testCompanyId);

      logger.info('Trigger function validation completed', {
        cardsTriggersWorking,
        companiesTriggersWorking,
        details,
      });

      return { cardsTriggersWorking, companiesTriggersWorking, details };

    } catch (error) {
      logger.error('Trigger function validation failed', { error });
      details.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return { cardsTriggersWorking: false, companiesTriggersWorking: false, details };
    }
  }

  // =============================================================================
  // INDEX STATISTICS
  // =============================================================================

  /**
   * Get detailed statistics about search indexes
   */
  async getIndexStatistics(): Promise<{
    cards: {
      indexName: string;
      indexSize: string;
      totalRows: number;
      indexedRows: number;
      indexUsage: number;
    };
    companies: {
      indexName: string;
      indexSize: string;
      totalRows: number;
      indexedRows: number;
      indexUsage: number;
    };
  }> {
    try {
      // Get cards index stats
      const cardsStats = await this.getTableIndexStats('cards', 'cards_search_vector_idx');
      const companiesStats = await this.getTableIndexStats('companies', 'companies_search_vector_idx');

      return {
        cards: cardsStats,
        companies: companiesStats,
      };
    } catch (error) {
      logger.error('Failed to get index statistics', { error });
      throw new Error('Failed to retrieve index statistics');
    }
  }

  private async getTableIndexStats(tableName: string, indexName: string) {
    // Get index size
    const sizeResult = await this.prisma.$queryRawUnsafe(
      `SELECT pg_size_pretty(pg_relation_size($1)) as size`,
      indexName
    ) as [{ size: string }];

    // Get row counts
    const rowCountResult = await this.prisma.$queryRawUnsafe(
      `SELECT 
         COUNT(*) as total_rows,
         COUNT(search_vector) as indexed_rows
       FROM ${tableName}`
    ) as [{ total_rows: bigint; indexed_rows: bigint }];

    // Get index usage (from pg_stat_user_indexes if available)
    const usageResult = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(idx_scan, 0) as usage_count
       FROM pg_stat_user_indexes 
       WHERE indexrelname = $1`,
      indexName
    ) as [{ usage_count: bigint }];

    return {
      indexName,
      indexSize: sizeResult[0].size,
      totalRows: Number(rowCountResult[0].total_rows),
      indexedRows: Number(rowCountResult[0].indexed_rows),
      indexUsage: Number(usageResult[0]?.usage_count || 0),
    };
  }

  // =============================================================================
  // MAINTENANCE OPERATIONS
  // =============================================================================

  /**
   * Analyze search index performance and suggest optimizations
   */
  async analyzeIndexPerformance(): Promise<{
    recommendations: string[];
    metrics: Record<string, any>;
  }> {
    const recommendations: string[] = [];
    const metrics: Record<string, any> = {};

    try {
      // Get index health
      const indexHealth = await this.getIndexHealth();
      metrics.indexHealth = indexHealth;

      // Check completeness
      indexHealth.forEach(health => {
        if (health.completeness < 95) {
          recommendations.push(
            `${health.tableName} index is ${health.completeness.toFixed(1)}% complete - consider reindexing`
          );
        }

        if (health.totalRecords > 10000 && health.completeness < 100) {
          recommendations.push(
            `Large ${health.tableName} table with incomplete indexing may impact search performance`
          );
        }
      });

      // Get index statistics
      const indexStats = await this.getIndexStatistics();
      metrics.indexStats = indexStats;

      // Check index usage
      if (indexStats.cards.indexUsage === 0 && indexStats.cards.totalRows > 0) {
        recommendations.push('Cards search index has not been used - verify search functionality');
      }

      if (indexStats.companies.indexUsage === 0 && indexStats.companies.totalRows > 0) {
        recommendations.push('Companies search index has not been used - verify search functionality');
      }

      // Check for large indexes with low usage
      const parseSize = (sizeStr: string): number => {
        const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(\w+)/);
        if (!match) return 0;
        
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        const multipliers: Record<string, number> = {
          'bytes': 1,
          'kb': 1024,
          'mb': 1024 * 1024,
          'gb': 1024 * 1024 * 1024,
        };
        
        return value * (multipliers[unit] || 1);
      };

      const cardsIndexSizeBytes = parseSize(indexStats.cards.indexSize);
      const companiesIndexSizeBytes = parseSize(indexStats.companies.indexSize);

      if (cardsIndexSizeBytes > 100 * 1024 * 1024 && indexStats.cards.indexUsage < 100) {
        recommendations.push('Cards index is large but rarely used - monitor search patterns');
      }

      if (companiesIndexSizeBytes > 100 * 1024 * 1024 && indexStats.companies.indexUsage < 100) {
        recommendations.push('Companies index is large but rarely used - monitor search patterns');
      }

      if (recommendations.length === 0) {
        recommendations.push('All search indexes are performing well');
      }

      logger.info('Index performance analysis completed', { 
        recommendationsCount: recommendations.length,
        metrics 
      });

      return { recommendations, metrics };

    } catch (error) {
      logger.error('Index performance analysis failed', { error });
      throw new Error('Failed to analyze index performance');
    }
  }
}