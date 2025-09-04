import type {
  AdvancedSearchParams,
  FullTextSearchParams,
  SearchCardsResponse,
  SearchCompaniesResponse,
  SearchSuggestionsResponse,
  SearchFiltersResponse,
  SearchSuggestionParams,
  FilterOptions,
} from '@namecard/shared/types/search.types';
import type { Card } from '@namecard/shared/types/card.types';
import type { Company } from '@namecard/shared/types/company.types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

class SearchService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('accessToken');
    
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search cards with advanced parameters
   */
  async searchCards(params: AdvancedSearchParams): Promise<SearchCardsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/cards`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(params),
    });

    return this.handleResponse<SearchCardsResponse>(response);
  }

  /**
   * Search companies
   */
  async searchCompanies(params: FullTextSearchParams): Promise<SearchCompaniesResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/companies`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(params),
    });

    return this.handleResponse<SearchCompaniesResponse>(response);
  }

  /**
   * Get search suggestions/autocomplete
   */
  async getSearchSuggestions(params: SearchSuggestionParams): Promise<SearchSuggestionsResponse> {
    const searchParams = new URLSearchParams({
      prefix: params.prefix,
      ...(params.type && { type: params.type }),
      ...(params.maxSuggestions && { maxSuggestions: params.maxSuggestions.toString() }),
    });

    const response = await fetch(`${API_BASE_URL}/api/v1/search/suggestions?${searchParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<SearchSuggestionsResponse>(response);
  }

  /**
   * Get available search filters
   */
  async getSearchFilters(baseQuery?: string): Promise<SearchFiltersResponse> {
    const searchParams = new URLSearchParams();
    if (baseQuery) {
      searchParams.set('q', baseQuery);
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/search/filters?${searchParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<SearchFiltersResponse>(response);
  }

  /**
   * Quick search for cards (simplified interface)
   */
  async quickSearchCards(
    query: string,
    options: {
      page?: number;
      limit?: number;
      highlight?: boolean;
      tags?: string[];
      companies?: string[];
      dateRange?: string;
    } = {}
  ): Promise<SearchCardsResponse> {
    const searchParams: AdvancedSearchParams = {
      q: query,
      page: options.page || 1,
      limit: options.limit || 20,
      highlight: options.highlight ?? true,
      searchMode: 'simple',
      
      // Apply filters if provided
      ...(options.tags && options.tags.length > 0 && { tags: options.tags }),
      ...(options.companies && options.companies.length > 0 && { mustHave: options.companies }),
      
      // Enable search in all fields for comprehensive results
      searchInNames: true,
      searchInTitles: true,
      searchInCompanies: true,
      searchInEmails: true,
      searchInNotes: true,
    };

    return this.searchCards(searchParams);
  }

  /**
   * Advanced search with boolean operators
   */
  async advancedSearchCards(
    query: string,
    options: {
      mustHave?: string[];
      shouldHave?: string[];
      mustNotHave?: string[];
      proximity?: boolean;
      fuzzy?: boolean;
      page?: number;
      limit?: number;
      tags?: string[];
      companies?: string[];
      industries?: string[];
    } = {}
  ): Promise<SearchCardsResponse> {
    const searchParams: AdvancedSearchParams = {
      q: query,
      page: options.page || 1,
      limit: options.limit || 20,
      searchMode: 'advanced',
      highlight: true,
      
      // Boolean operators
      mustHave: options.mustHave,
      shouldHave: options.shouldHave,
      mustNotHave: options.mustNotHave,
      
      // Search options
      proximity: options.proximity,
      fuzzy: options.fuzzy,
      
      // Filters
      ...(options.tags && options.tags.length > 0 && { tags: options.tags }),
      
      // Field search
      searchInNames: true,
      searchInTitles: true,
      searchInCompanies: true,
      searchInEmails: true,
      searchInNotes: true,
    };

    return this.searchCards(searchParams);
  }

  /**
   * Search with proximity (adjacent terms)
   */
  async proximitySearchCards(
    terms: string[],
    options: {
      distance?: number;
      adjacent?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<SearchCardsResponse> {
    const query = options.adjacent 
      ? terms.join(' <-> ') // Adjacent terms
      : terms.join(` <${options.distance || 3}> `); // Terms within distance

    const searchParams: AdvancedSearchParams = {
      q: query,
      page: options.page || 1,
      limit: options.limit || 20,
      searchMode: 'proximity',
      highlight: true,
      proximity: true,
      proximityDistance: options.distance || 3,
      adjacentTerms: options.adjacent,
      
      searchInNames: true,
      searchInTitles: true,
      searchInCompanies: true,
      searchInEmails: true,
    };

    return this.searchCards(searchParams);
  }

  /**
   * Get search analytics (if available)
   */
  async getSearchAnalytics(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/analytics`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<any>(response);
  }

  /**
   * Get search system health
   */
  async getSearchHealth(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/health`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<any>(response);
  }

  /**
   * Trigger search index rebuild
   */
  async triggerReindex(table: 'cards' | 'companies' | 'all' = 'all'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/v1/search/reindex`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ table }),
    });

    return this.handleResponse<any>(response);
  }
}

// Export singleton instance
export const searchService = new SearchService();
export default searchService;

// Export types for convenience
export type {
  AdvancedSearchParams,
  FullTextSearchParams,
  SearchCardsResponse,
  SearchCompaniesResponse,
  SearchSuggestionsResponse,
  SearchSuggestionParams,
  Card,
  Company,
  FilterOptions,
};