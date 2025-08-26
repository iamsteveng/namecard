export interface SearchResult<T = any> {
  id: string;
  score: number;
  document: T;
  highlights?: Record<string, string[]>;
}

export interface SearchResponse<T = any> {
  results: SearchResult<T>[];
  total: number;
  query: string;
  took: number; // Search time in milliseconds
  maxScore?: number;
}

export interface SearchQuery {
  q: string; // Query string
  limit?: number; // Results limit (default: 10)
  offset?: number; // Results offset (default: 0)
  fields?: string[]; // Fields to search in
  highlight?: {
    fields: string[];
    tags?: {
      pre: string;
      post: string;
    };
  };
  sort?: {
    field: string;
    direction: 'ASC' | 'DESC';
  }[];
  filters?: {
    field: string;
    value: string | number | boolean;
    operator?: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN';
  }[];
}

export interface IndexableDocument {
  id: string;
  type: 'card' | 'company';
  title: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchIndexConfig {
  indexName: string;
  schema: {
    [fieldName: string]: {
      type: 'TEXT' | 'NUMERIC' | 'TAG' | 'GEO';
      weight?: number;
      sortable?: boolean;
      noindex?: boolean;
    };
  };
}

export interface CardSearchDocument extends IndexableDocument {
  type: 'card';
  metadata: {
    userId: string;
    companyName?: string;
    personName?: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    jobTitle?: string;
    tags: string[];
    enriched: boolean;
  };
}

export interface CompanySearchDocument extends IndexableDocument {
  type: 'company';
  metadata: {
    domain: string;
    industry?: string;
    size?: string;
    description?: string;
    location?: string;
    founded?: number;
    tags: string[];
    socialMedia?: Record<string, string>;
  };
}

export type SearchDocument = CardSearchDocument | CompanySearchDocument;

export interface SearchStats {
  totalDocuments: number;
  totalIndexes: number;
  indexSizes: Record<string, number>;
  lastIndexed: Date | null;
}