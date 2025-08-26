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
        'metadata.companyName': { type: 'TEXT', weight: 2 },
        'metadata.personName': { type: 'TEXT', weight: 2 },
        'metadata.email': { type: 'TEXT', sortable: true },
        'metadata.phone': { type: 'TEXT' },
        'metadata.website': { type: 'TEXT' },
        'metadata.jobTitle': { type: 'TEXT' },
        'metadata.address': { type: 'TEXT' },
        'metadata.tags': { type: 'TAG' },
        'metadata.userId': { type: 'TAG', sortable: true },
        'metadata.enriched': { type: 'TAG' },
        createdAt: { type: 'NUMERIC', sortable: true },
        updatedAt: { type: 'NUMERIC', sortable: true },
      },
    };

    const companyIndexConfig: SearchIndexConfig = {
      indexName: 'idx:companies',
      schema: {
        title: { type: 'TEXT', weight: 3 },
        content: { type: 'TEXT', weight: 2 },
        'metadata.domain': { type: 'TEXT', sortable: true },
        'metadata.industry': { type: 'TEXT' },
        'metadata.size': { type: 'TAG' },
        'metadata.description': { type: 'TEXT' },
        'metadata.location': { type: 'TEXT' },
        'metadata.founded': { type: 'NUMERIC', sortable: true },
        'metadata.tags': { type: 'TAG' },
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
      const schema = Object.entries(config.schema).flatMap(([field, options]) => {
        const fieldDef: any[] = [field, options.type];

        if (options.weight) {
          fieldDef.push('WEIGHT', options.weight.toString());
        }
        if (options.sortable) {
          fieldDef.push('SORTABLE');
        }
        if (options.noindex) {
          fieldDef.push('NOINDEX');
        }

        return fieldDef;
      });

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
          redisDoc[`metadata.${key}`] = value.join(',');
        } else if (value !== null && value !== undefined) {
          redisDoc[`metadata.${key}`] = String(value);
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

  async search<T = any>(query: SearchQuery, indexName: string): Promise<SearchResponse<T>> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    const startTime = Date.now();

    try {
      // Build search query
      let searchQuery = query.q || '*';

      // Apply filters
      if (query.filters && query.filters.length > 0) {
        const filterQueries = query.filters.map((filter: any) => {
          switch (filter.operator || 'EQ') {
            case 'EQ':
              return `@${filter.field}:{${filter.value}}`;
            case 'NE':
              return `-@${filter.field}:{${filter.value}}`;
            case 'GT':
              return `@${filter.field}:[(${filter.value} +inf]`;
            case 'GTE':
              return `@${filter.field}:[${filter.value} +inf]`;
            case 'LT':
              return `@${filter.field}:[-inf (${filter.value}]`;
            case 'LTE':
              return `@${filter.field}:[-inf ${filter.value}]`;
            case 'IN': {
              const values = Array.isArray(filter.value) ? filter.value : [filter.value];
              return `@${filter.field}:{${values.join('|')}}`;
            }
            default:
              return `@${filter.field}:{${filter.value}}`;
          }
        });

        searchQuery = `(${searchQuery}) ${filterQueries.join(' ')}`;
      }

      // Search fields restriction
      if (query.fields && query.fields.length > 0) {
        const fieldRestrictions = query.fields
          .map((field: string) => `@${field}:(${query.q})`)
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
        options.SORTBY = sort.direction === 'DESC' ? `${sort.field} DESC` : sort.field;
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
      const result: RedisSearchResult = await this.client.ft.search(
        indexName,
        searchQuery,
        options
      );

      // Transform results
      const results: SearchResult<T>[] = result.documents.map((doc) => {
        const document: any = {};
        const highlights: Record<string, string[]> = {};

        Object.entries(doc.value).forEach(([key, value]) => {
          if (key.startsWith('__')) {
            // Highlighting results
            const fieldName = key.replace(/^__/, '').replace(/__$/, '');
            highlights[fieldName] = [value];
          } else if (key.startsWith('metadata.')) {
            const metaKey = key.replace('metadata.', '');
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

      return {
        results,
        total: result.total,
        query: query.q || '',
        took,
      };
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
