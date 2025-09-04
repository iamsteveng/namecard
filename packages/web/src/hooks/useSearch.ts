import type { Card } from '@namecard/shared/types/card.types';
import type {
  SearchSuggestion,
  FilterOptions,
  AdvancedSearchParams,
  SearchResultItem,
} from '@namecard/shared/types/search.types';
import { useState, useEffect, useCallback, useRef } from 'react';

import searchService from '../services/search.service';

// Debounce utility
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Search state interface
interface SearchState {
  query: string;
  results: SearchResultItem<Card>[];
  isLoading: boolean;
  error: string | null;
  totalResults: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  executionTime: string;
  searchMode: 'simple' | 'advanced' | 'boolean' | 'proximity';
}

// Search filters state
interface SearchFilters {
  tags: string[];
  companies: string[];
  industries: string[];
  dateRange?: string | undefined;
}

// Search suggestions state
interface SearchSuggestionsState {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  error: string | null;
}

// Filter options state
interface FilterOptionsState {
  options: FilterOptions | null;
  isLoading: boolean;
  error: string | null;
}

// Main search hook
export function useSearch(initialQuery: string = '') {
  // Search state
  const [searchState, setSearchState] = useState<SearchState>({
    query: initialQuery,
    results: [],
    isLoading: false,
    error: null,
    totalResults: 0,
    currentPage: 1,
    totalPages: 0,
    hasMore: false,
    executionTime: '0ms',
    searchMode: 'simple',
  });

  // Search filters
  const [filters, setFilters] = useState<SearchFilters>({
    tags: [],
    companies: [],
    industries: [],
    dateRange: undefined,
  });

  // Debounce search query to avoid too many API calls
  const debouncedQuery = useDebounce(searchState.query, 300);

  // Track abort controller for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search function
  const performSearch = useCallback(
    async (
      query: string,
      page: number = 1,
      searchFilters: SearchFilters = filters,
      resetResults: boolean = true
    ) => {
      if (!query.trim()) {
        setSearchState(prev => ({
          ...prev,
          results: resetResults ? [] : prev.results,
          isLoading: false,
          error: null,
          totalResults: 0,
          totalPages: 0,
          hasMore: false,
          executionTime: '0ms',
        }));
        return;
      }

      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      setSearchState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        ...(resetResults && { results: [] }),
        currentPage: page,
      }));

      try {
        const searchParams: AdvancedSearchParams = {
          q: query,
          page,
          limit: 20,
          highlight: true,
          searchMode: searchState.searchMode,

          // Apply filters
          ...(searchFilters.tags.length > 0 && { tags: searchFilters.tags }),
          ...(searchFilters.companies.length > 0 && { mustHave: searchFilters.companies }),

          // Enable comprehensive search
          searchInNames: true,
          searchInTitles: true,
          searchInCompanies: true,
          searchInEmails: true,
          searchInNotes: true,
        };

        const response = await searchService.searchCards(searchParams);

        if (response.success) {
          setSearchState(prev => ({
            ...prev,
            results: resetResults
              ? response.data.results
              : [...prev.results, ...response.data.results],
            isLoading: false,
            error: null,
            totalResults: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
            hasMore: response.data.pagination.hasNext,
            executionTime: response.data.searchMeta.executionTime,
            searchMode: response.data.searchMeta.searchMode,
          }));
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setSearchState(prev => ({
            ...prev,
            isLoading: false,
            error: error.message,
          }));
        }
      }
    },
    [filters, searchState.searchMode]
  );

  // Auto-search when debounced query changes
  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  // Search actions
  const setQuery = useCallback((query: string) => {
    setSearchState(prev => ({ ...prev, query }));
  }, []);

  const setSearchMode = useCallback((mode: SearchState['searchMode']) => {
    setSearchState(prev => ({ ...prev, searchMode: mode }));
  }, []);

  const addFilter = useCallback((type: keyof SearchFilters, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (type === 'dateRange') {
        newFilters[type] = value;
      } else {
        const currentValues = prev[type] as string[];
        if (!currentValues.includes(value)) {
          newFilters[type] = [...currentValues, value];
        }
      }
      return newFilters;
    });
  }, []);

  const removeFilter = useCallback((type: keyof SearchFilters, value?: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (type === 'dateRange') {
        newFilters[type] = undefined;
      } else if (value) {
        const currentValues = prev[type] as string[];
        newFilters[type] = currentValues.filter(v => v !== value);
      } else {
        newFilters[type] = [];
      }
      return newFilters;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      tags: [],
      companies: [],
      industries: [],
      dateRange: undefined,
    });
  }, []);

  const loadMore = useCallback(() => {
    if (searchState.hasMore && !searchState.isLoading) {
      performSearch(searchState.query, searchState.currentPage + 1, filters, false);
    }
  }, [
    searchState.hasMore,
    searchState.isLoading,
    searchState.query,
    searchState.currentPage,
    filters,
    performSearch,
  ]);

  const refresh = useCallback(() => {
    performSearch(searchState.query, 1, filters, true);
  }, [searchState.query, filters, performSearch]);

  const clear = useCallback(() => {
    setSearchState({
      query: '',
      results: [],
      isLoading: false,
      error: null,
      totalResults: 0,
      currentPage: 1,
      totalPages: 0,
      hasMore: false,
      executionTime: '0ms',
      searchMode: 'simple',
    });
    clearFilters();
  }, [clearFilters]);

  // Computed values
  const hasResults = searchState.results.length > 0;
  const hasFilters =
    filters.tags.length > 0 ||
    filters.companies.length > 0 ||
    filters.industries.length > 0 ||
    Boolean(filters.dateRange);
  const isSearching = searchState.isLoading;

  return {
    // State
    ...searchState,
    filters,

    // Computed
    hasResults,
    hasFilters,
    isSearching,

    // Actions
    setQuery,
    setSearchMode,
    addFilter,
    removeFilter,
    clearFilters,
    loadMore,
    refresh,
    clear,
    search: performSearch,
  };
}

// Search suggestions hook
export function useSearchSuggestions(query: string, enabled: boolean = true) {
  const [state, setState] = useState<SearchSuggestionsState>({
    suggestions: [],
    isLoading: false,
    error: null,
  });

  const debouncedQuery = useDebounce(query, 200);

  useEffect(() => {
    if (!enabled || !debouncedQuery || debouncedQuery.length < 2) {
      setState({
        suggestions: [],
        isLoading: false,
        error: null,
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    searchService
      .getSearchSuggestions({
        prefix: debouncedQuery,
        maxSuggestions: 8,
      })
      .then(response => {
        if (response.success) {
          setState({
            suggestions: response.data.suggestions,
            isLoading: false,
            error: null,
          });
        }
      })
      .catch(error => {
        setState({
          suggestions: [],
          isLoading: false,
          error: error.message,
        });
      });
  }, [debouncedQuery, enabled]);

  return state;
}

// Filter options hook
export function useSearchFilters(baseQuery?: string) {
  const [state, setState] = useState<FilterOptionsState>({
    options: null,
    isLoading: false,
    error: null,
  });

  const loadFilters = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await searchService.getSearchFilters(baseQuery);

      if (response.success) {
        setState({
          options: response.data.filters as unknown as FilterOptions,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      setState({
        options: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load filters',
      });
    }
  }, [baseQuery]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  return {
    ...state,
    reload: loadFilters,
  };
}

// Export types
export type { SearchState, SearchFilters, SearchSuggestionsState, FilterOptionsState };
