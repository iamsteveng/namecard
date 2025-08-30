import {
  SearchQuery,
  SearchResponse,
  SearchDocument,
  SearchIndexConfig,
  IndexableDocument,
} from '@namecard/shared';
// Removed unused import: RedisClientType from 'redis'

export interface RedisSearchClient {
  ft: {
    create: (
      index: string,
      schema: any[],
      options?: {
        ON?: string;
        PREFIX?: string[];
        STOPWORDS?: string[];
      }
    ) => Promise<string>;
    dropIndex: (index: string, options?: { DD?: boolean }) => Promise<string>;
    search: (
      index: string,
      query: string,
      options?: {
        LIMIT?: { from: number; size: number };
        SORTBY?: string;
        RETURN?: string[];
        HIGHLIGHT?: {
          FIELDS: string[];
          TAGS: { open: string; close: string };
        };
      }
    ) => Promise<RedisSearchResult>;
    info: (index: string) => Promise<string[]>;
  };
  hSet: (key: string, field: string | Record<string, any>, value?: any) => Promise<number>;
  hGetAll: (key: string) => Promise<Record<string, string>>;
  del: (keys: string | string[]) => Promise<number>;
  exists: (key: string) => Promise<number>;
  ping: () => Promise<string>;
  connect: () => Promise<void>;
  quit: () => Promise<string>;
  on: (event: string, listener: (...args: any[]) => void) => void;
}

export interface RedisSearchResult {
  total: number;
  documents: Array<{
    id: string;
    value: Record<string, string>;
  }>;
}

export interface SearchService {
  initialize(): Promise<void>;
  createIndex(config: SearchIndexConfig): Promise<void>;
  dropIndex(indexName: string): Promise<void>;
  indexDocument(document: IndexableDocument): Promise<void>;
  indexDocuments(documents: IndexableDocument[]): Promise<void>;
  removeDocument(id: string, indexName: string): Promise<void>;
  search<T = SearchDocument>(query: SearchQuery, indexName: string): Promise<SearchResponse<T>>;
  getIndexInfo(indexName: string): Promise<Record<string, any>>;
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }>;
}

export interface IndexingService {
  indexCard(cardId: string): Promise<void>;
  indexCards(cardIds: string[]): Promise<void>;
  indexCompany(companyId: string): Promise<void>;
  indexCompanies(companyIds: string[]): Promise<void>;
  removeCard(cardId: string): Promise<void>;
  removeCompany(companyId: string): Promise<void>;
  reindexAll(): Promise<void>;
  getIndexStats(): Promise<{
    cards: { total: number; lastIndexed: Date | null };
    companies: { total: number; lastIndexed: Date | null };
  }>;
}

export const SEARCH_INDEXES = {
  CARDS: 'idx:cards',
  COMPANIES: 'idx:companies',
} as const;

export type SearchIndexName = (typeof SEARCH_INDEXES)[keyof typeof SEARCH_INDEXES];
