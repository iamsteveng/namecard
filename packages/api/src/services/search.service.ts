import {
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchIndexConfig,
  IndexableDocument,
} from '@namecard/shared';

import redisConfig from '../config/redis.config.js';
import type {
  SearchService as ISearchService,
  RedisSearchClient,
  RedisSearchResult,
} from '../types/search.types.js';
import logger from '../utils/logger.js';

export class SearchService implements ISearchService {
  private client: RedisSearchClient | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.client = await redisConfig.getClient();
      await this.setupIndexes();
      this.initialized = true;
      logger.info('Search service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize search service:', error);
      throw error;
    }
  }

  private async setupIndexes(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    const cardIndexConfig: SearchIndexConfig = {
      indexName: 'idx:cards',
      schema: {
        title: { type: 'TEXT', weight: 3 },
        content: { type: 'TEXT', weight: 2 },
        metadata_companyName: { type: 'TEXT', weight: 2 },
        metadata_personName: { type: 'TEXT', weight: 2 },
        metadata_email: { type: 'TEXT', sortable: true },
        metadata_phone: { type: 'TEXT' },
        metadata_website: { type: 'TEXT' },
        metadata_jobTitle: { type: 'TEXT' },
        metadata_address: { type: 'TEXT' },
        metadata_tags: { type: 'TAG' },
        metadata_userId: { type: 'TAG', sortable: true },
        metadata_enriched: { type: 'TAG' },
        createdAt: { type: 'NUMERIC', sortable: true },
        updatedAt: { type: 'NUMERIC', sortable: true },
      },
    };

    const companyIndexConfig: SearchIndexConfig = {
      indexName: 'idx:companies',
      schema: {
        title: { type: 'TEXT', weight: 3 },
        content: { type: 'TEXT', weight: 2 },
        metadata_domain: { type: 'TEXT', sortable: true },
        metadata_industry: { type: 'TEXT' },
        metadata_size: { type: 'TAG' },
        metadata_description: { type: 'TEXT' },
        metadata_location: { type: 'TEXT' },
        metadata_founded: { type: 'NUMERIC', sortable: true },
        metadata_tags: { type: 'TAG' },
        createdAt: { type: 'NUMERIC', sortable: true },
        updatedAt: { type: 'NUMERIC', sortable: true },
      },
    };

    await this.ensureIndex(cardIndexConfig);
    await this.ensureIndex(companyIndexConfig);
  }

  private async ensureIndex(config: SearchIndexConfig): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      // Check if index exists
      await this.client.ft.info(config.indexName);
      logger.info(`Search index ${config.indexName} already exists`);
    } catch (error) {
      // Index doesn't exist, create it
      await this.createIndex(config);
    }
  }

  async createIndex(config: SearchIndexConfig): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      // Build schema in Redis Search format: flat array
      const schema: string[] = [];

      for (const [field, options] of Object.entries(config.schema)) {
        schema.push(field, options.type);

        if (options.weight) {
          schema.push('WEIGHT', options.weight.toString());
        }
        if (options.sortable) {
          schema.push('SORTABLE');
        }
        if (options.noindex) {
          schema.push('NOINDEX');
        }
      }

      await this.client.ft.create(config.indexName, schema, {
        ON: 'HASH',
        PREFIX: [`${config.indexName.replace('idx:', 'doc:')}:`],
      });

      logger.info(`Created search index: ${config.indexName}`);
    } catch (error) {
      logger.error(`Failed to create search index ${config.indexName}:`, error);
      throw error;
    }
  }

  async dropIndex(indexName: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      await this.client.ft.dropIndex(indexName);
      logger.info(`Dropped search index: ${indexName}`);
    } catch (error) {
      logger.error(`Failed to drop search index ${indexName}:`, error);
      throw error;
    }
  }

  async indexDocument(document: IndexableDocument): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const indexName = document.type === 'card' ? 'idx:cards' : 'idx:companies';
      const docKey = `doc:${indexName.replace('idx:', '')}:${document.id}`;

      const redisDoc: Record<string, string> = {
        id: document.id,
        type: document.type,
        title: document.title,
        content: document.content,
        createdAt: document.createdAt.getTime().toString(),
        updatedAt: document.updatedAt.getTime().toString(),
      };

      // Flatten metadata for Redis
      Object.entries(document.metadata).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          redisDoc[`metadata_${key}`] = value.join(',');
        } else if (value !== null && value !== undefined) {
          redisDoc[`metadata_${key}`] = String(value);
        }
      });

      await this.client.hSet(docKey, redisDoc);
      logger.debug(`Indexed document: ${document.id} in ${indexName}`);
    } catch (error) {
      logger.error(`Failed to index document ${document.id}:`, error);
      throw error;
    }
  }

  async indexDocuments(documents: IndexableDocument[]): Promise<void> {
    const promises = documents.map(doc => this.indexDocument(doc));
    await Promise.allSettled(promises);
    logger.info(`Batch indexed ${documents.length} documents`);
  }

  async removeDocument(id: string, indexName: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const docKey = `doc:${indexName.replace('idx:', '')}:${id}`;
      await this.client.del(docKey);
      logger.debug(`Removed document: ${id} from ${indexName}`);
    } catch (error) {
      logger.error(`Failed to remove document ${id} from ${indexName}:`, error);
      throw error;
    }
  }

  private enhanceSearchQuery(rawQuery: string): string {
    if (!rawQuery || rawQuery === '*' || rawQuery.trim() === '') {
      return rawQuery;
    }

    // Split into words and enhance each term for partial matching
    const terms = rawQuery.trim().split(/\s+/).filter(Boolean);
    const enhancedTerms = terms.map(term => {
      // Skip if already has wildcards, field restrictions, or special Redis Search syntax
      if (
        term.includes('*') ||
        term.includes('@') ||
        term.includes(':') ||
        term.includes('(') ||
        term.includes(')')
      ) {
        return term;
      }

      // Add prefix wildcard for partial matching
      return `${term}*`;
    });

    return enhancedTerms.join(' ');
  }

  async search<T = any>(query: SearchQuery, indexName: string): Promise<SearchResponse<T>> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    const startTime = Date.now();

    try {
      // Build search query with automatic partial matching enhancement
      let searchQuery = this.enhanceSearchQuery(query.q || '*');

      // Apply filters
      if (query.filters && query.filters.length > 0) {
        const filterQueries = query.filters.map((filter: any) => {
          // Escape field names with dots by replacing dots with underscores in the query
          // but keep the original field name for the schema
          const fieldName = filter.field.replace(/\./g, '_');

          switch (filter.operator || 'EQ') {
            case 'EQ':
              return `@${fieldName}:{${filter.value}}`;
            case 'NE':
              return `-@${fieldName}:{${filter.value}}`;
            case 'GT':
              return `@${fieldName}:[(${filter.value} +inf]`;
            case 'GTE':
              return `@${fieldName}:[${filter.value} +inf]`;
            case 'LT':
              return `@${fieldName}:[-inf (${filter.value}]`;
            case 'LTE':
              return `@${fieldName}:[-inf ${filter.value}]`;
            case 'IN': {
              const values = Array.isArray(filter.value) ? filter.value : [filter.value];
              return `@${fieldName}:{${values.join('|')}}`;
            }
            default:
              return `@${fieldName}:{${filter.value}}`;
          }
        });

        searchQuery = `(${searchQuery}) ${filterQueries.join(' ')}`;
      }

      // Search fields restriction
      if (query.fields && query.fields.length > 0) {
        const fieldRestrictions = query.fields
          .map((field: string) => {
            const fieldName = field.replace(/\./g, '_');
            return `@${fieldName}:(${query.q})`;
          })
          .join(' | ');
        searchQuery = `(${fieldRestrictions})`;
      }

      // Build search options
      const options: any = {};

      // Pagination
      const limit = query.limit || 10;
      const offset = query.offset || 0;
      options.LIMIT = { from: offset, size: limit };

      // Sorting
      if (query.sort && query.sort.length > 0) {
        const sort = query.sort[0]; // Redis Search supports one sort field
        if (sort.direction === 'DESC') {
          options.SORTBY = { BY: sort.field, DIRECTION: 'DESC' };
        } else {
          options.SORTBY = { BY: sort.field };
        }
      } else {
        // Default sort by creation date (newest first)
        options.SORTBY = { BY: 'createdAt', DIRECTION: 'DESC' };
      }

      // Highlighting
      if (query.highlight) {
        options.HIGHLIGHT = {
          FIELDS: query.highlight.fields,
          TAGS: {
            open: query.highlight.tags?.pre || '<mark>',
            close: query.highlight.tags?.post || '</mark>',
          },
        };
      }

      // Execute search
      logger.debug('Executing Redis search', {
        indexName,
        searchQuery,
        options,
        originalQuery: query,
      });

      const result: RedisSearchResult = await this.client.ft.search(
        indexName,
        searchQuery,
        options
      );

      logger.debug('Redis search raw results', {
        indexName,
        totalResults: result.total,
        documentCount: result.documents?.length || 0,
        rawDocuments: result.documents,
      });

      // Transform results
      const results: SearchResult<T>[] = result.documents.map(doc => {
        const document: any = {};
        const highlights: Record<string, string[]> = {};

        Object.entries(doc.value).forEach(([key, value]) => {
          if (key.startsWith('__')) {
            // Highlighting results
            const fieldName = key.replace(/^__/, '').replace(/__$/, '');
            highlights[fieldName] = [value];
          } else if (key.startsWith('metadata_')) {
            const metaKey = key.replace('metadata_', '');
            if (!document.metadata) {
              document.metadata = {};
            }

            // Handle arrays (tags)
            if (metaKey === 'tags' && typeof value === 'string') {
              document.metadata[metaKey] = value.split(',').filter(Boolean);
            } else {
              document.metadata[metaKey] = value;
            }
          } else if (key === 'createdAt' || key === 'updatedAt') {
            document[key] = new Date(parseInt(value));
          } else {
            document[key] = value;
          }
        });

        return {
          id: doc.id,
          score: 1.0, // Redis Search doesn't provide scores in this format
          document: document as T,
          highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
        };
      });

      const took = Date.now() - startTime;

      const response = {
        results,
        total: result.total,
        query: query.q || '',
        took,
      };

      logger.debug('Search completed', {
        indexName,
        query: query.q || '',
        totalResults: result.total,
        returnedResults: results.length,
        took,
        userId: query.filters?.find(f => f.field === 'metadata.userId')?.value,
      });

      return response;
    } catch (error) {
      logger.error(`Search failed for query "${query.q}" in ${indexName}:`, error);
      throw error;
    }
  }

  async getIndexInfo(indexName: string): Promise<Record<string, any>> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const info = await this.client.ft.info(indexName);

      // Parse Redis info array into object
      const infoObj: Record<string, any> = {};
      for (let i = 0; i < info.length; i += 2) {
        infoObj[info[i]] = info[i + 1];
      }

      return infoObj;
    } catch (error) {
      logger.error(`Failed to get index info for ${indexName}:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
    try {
      const redisHealth = await redisConfig.healthCheck();

      if (redisHealth.status === 'unhealthy') {
        return {
          status: 'unhealthy',
          details: {
            redis: redisHealth,
            initialized: this.initialized,
          },
        };
      }

      // Test search functionality
      let searchTest = false;
      try {
        await this.search({ q: '*' }, 'idx:cards');
        searchTest = true;
      } catch (error) {
        logger.debug('Search health check failed:', error);
      }

      return {
        status: searchTest ? 'healthy' : 'unhealthy',
        details: {
          redis: redisHealth,
          initialized: this.initialized,
          searchTest,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          initialized: this.initialized,
        },
      };
    }
  }
}

export const searchService = new SearchService();
