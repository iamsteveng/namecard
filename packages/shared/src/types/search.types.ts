// Enhanced search types for PostgreSQL full-text search functionality
import type { PaginationParams, SearchParams } from './common.types';
import type { Card } from './card.types';
import type { Company } from './company.types';

// =============================================================================
// SEARCH MODE TYPES
// =============================================================================

export type SearchMode = 'simple' | 'advanced' | 'boolean' | 'proximity';
export type SearchType = 'cards' | 'companies' | 'all';
export type SuggestionType = 'name' | 'company' | 'title' | 'email' | 'tags';

// =============================================================================
// FULL-TEXT SEARCH PARAMETERS
// =============================================================================

export interface FullTextSearchParams extends SearchParams, PaginationParams {
  // Search behavior
  searchMode?: SearchMode;
  highlight?: boolean;
  includeRank?: boolean;
  minRank?: number;

  // Search operators
  proximity?: boolean;
  fuzzy?: boolean;
  exactPhrase?: boolean;

  // Performance options
  maxResults?: number;
  timeout?: number;
}

export interface AdvancedSearchParams extends FullTextSearchParams {
  // Boolean operators
  mustHave?: string[]; // AND terms
  shouldHave?: string[]; // OR terms
  mustNotHave?: string[]; // NOT terms

  // Field-specific search
  searchInNames?: boolean;
  searchInTitles?: boolean;
  searchInCompanies?: boolean;
  searchInNotes?: boolean;
  searchInEmails?: boolean;

  // Proximity search
  proximityDistance?: number;
  adjacentTerms?: boolean;
}

export interface SearchSuggestionParams {
  prefix: string;
  type?: SuggestionType;
  maxSuggestions?: number;
  userId?: string;
}

// =============================================================================
// SEARCH RESULTS & RESPONSES
// =============================================================================

export interface SearchMeta {
  query: string;
  processedQuery: string;
  executionTime: string;
  totalMatches: number;
  searchMode: SearchMode;
  hasMore: boolean;
  searchId?: string;
}

export interface SearchHighlight {
  field: string;
  value: string;
  positions?: number[];
}

export interface SearchResultItem<T = Card | Company> {
  item: T;
  rank: number;
  highlights?: SearchHighlight[];
  score?: number;
  matchedFields?: string[];
}

export interface SearchResults<T = Card | Company> {
  success: true;
  data: {
    results: SearchResultItem<T>[];
    searchMeta: SearchMeta;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    filters?: FilterOptions;
    suggestions?: SearchSuggestion[];
  };
}

export interface SearchError {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Record<string, any>;
  };
  searchMeta?: Partial<SearchMeta>;
}

// =============================================================================
// SEARCH SUGGESTIONS & AUTOCOMPLETE
// =============================================================================

export interface SearchSuggestion {
  text: string;
  type: SuggestionType;
  count?: number;
  score?: number;
  category?: string;
}

export interface SearchSuggestionsResponse {
  success: true;
  data: {
    suggestions: SearchSuggestion[];
    searchMeta: {
      prefix: string;
      type?: SuggestionType;
      executionTime: string;
    };
  };
}

// =============================================================================
// DYNAMIC FILTERS
// =============================================================================

export interface FilterOption {
  value: string;
  label: string;
  count: number;
  selected?: boolean;
}

export interface FilterCategory {
  name: string;
  label: string;
  type: 'single' | 'multiple' | 'range' | 'date';
  options: FilterOption[];
}

export interface FilterOptions {
  companies: FilterOption[];
  tags: FilterOption[];
  industries: FilterOption[];
  dateRanges: FilterOption[];
  locations: FilterOption[];
}

export interface SearchFiltersResponse {
  success: true;
  data: {
    filters: FilterCategory[];
    searchMeta: {
      baseQuery?: string;
      resultCount: number;
      executionTime: string;
    };
  };
}

// =============================================================================
// SEARCH ANALYTICS & MONITORING
// =============================================================================

export interface SearchAnalytics {
  queryId: string;
  query: string;
  userId?: string;
  searchMode: SearchMode;
  resultCount: number;
  executionTime: number;
  clickedResults?: string[];
  timestamp: Date;
}

export interface SearchPerformanceMetrics {
  averageExecutionTime: number;
  totalQueries: number;
  successRate: number;
  popularQueries: Array<{ query: string; count: number }>;
  slowQueries: Array<{ query: string; executionTime: number }>;
}

// =============================================================================
// INDEX MANAGEMENT
// =============================================================================

export interface IndexHealth {
  tableName: string;
  totalRecords: number;
  indexedRecords: number;
  completeness: number; // percentage
  lastUpdated: Date;
  indexSize: string;
}

export interface IndexingJob {
  id: string;
  tableName: string;
  operation: 'full_reindex' | 'partial_update' | 'validate';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  errorMessage?: string;
  recordsProcessed?: number;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

// Card search requests
export interface SearchCardsRequest {
  query: FullTextSearchParams | AdvancedSearchParams;
  headers: {
    authorization: string;
  };
}

export interface SearchCardsResponse extends SearchResults<Card> {}

// Company search requests
export interface SearchCompaniesRequest {
  query: FullTextSearchParams;
  headers: {
    authorization: string;
  };
}

export interface SearchCompaniesResponse extends SearchResults<Company> {}

// Universal search (cards + companies)
export interface UniversalSearchRequest {
  query: FullTextSearchParams & {
    types?: SearchType[];
  };
  headers: {
    authorization: string;
  };
}

export interface UniversalSearchResults {
  cards: SearchResultItem<Card>[];
  companies: SearchResultItem<Company>[];
  searchMeta: SearchMeta;
}

export interface UniversalSearchResponse {
  success: true;
  data: UniversalSearchResults;
}
