// Search components exports
export { default as SearchBar } from './SearchBar';
export { default as SearchResults } from './SearchResults';
export { default as SearchFilters } from './SearchFilters';
export { default as SearchPage } from './SearchPage';

// Re-export search service and hooks for convenience
export { default as searchService } from '../../services/search.service';
export { useSearch, useSearchSuggestions, useSearchFilters } from '../../hooks/useSearch';

// Types
export type {
  SearchState,
  SearchFilters as SearchFiltersState,
  SearchSuggestionsState,
  FilterOptionsState,
} from '../../hooks/useSearch';

export type {
  AdvancedSearchParams,
  FullTextSearchParams,
  SearchCardsResponse,
  SearchCompaniesResponse,
  SearchSuggestionsResponse,
  SearchSuggestionParams,
  FilterOptions,
} from '../../services/search.service';