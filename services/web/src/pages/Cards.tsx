import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Search,
  Download,
  MoreVertical,
  Mail,
  Phone,
  Globe,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { EnrichmentStatusBadge } from '../components/enrichment/EnrichmentStatusIndicator';
import SearchBar from '../components/search/SearchBar';
import SearchFilters from '../components/search/SearchFilters';
import SearchResults from '../components/search/SearchResults';
import { useSearch, useSearchFilters } from '../hooks/useSearch';
import cardsService from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';

export default function Cards() {
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [useAdvancedSearch, setUseAdvancedSearch] = useState(false);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;

  // Check URL params for advanced search mode
  useEffect(() => {
    const searchMode = searchParams.get('search');
    if (searchMode === 'advanced') {
      setUseAdvancedSearch(true);
      setFiltersOpen(true);
    }
  }, [searchParams]);

  // Initialize search functionality
  const {
    query,
    results: searchResults,
    isLoading: searchLoading,
    error: searchError,
    totalResults,
    executionTime,
    hasMore,
    filters,
    hasFilters,
    setQuery,
    addFilter,
    removeFilter,
    clearFilters,
    loadMore,
    clear: clearSearch,
  } = useSearch();

  // Get available filter options
  const { options: filterOptions, isLoading: isLoadingFilters } = useSearchFilters(query);

  // Fallback to regular cards query when not searching
  const {
    data: cardsResponse,
    isLoading: cardsLoading,
    error: cardsError,
    refetch,
  } = useQuery({
    queryKey: ['cards', 'all'],
    queryFn: () => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      return cardsService.getCards(accessToken, {
        page: 1,
        limit: 100, // Get more cards for local fallback
        sort: 'desc',
        sortBy: 'createdAt',
      });
    },
    enabled: !!accessToken && !query, // Only fetch when not searching
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Determine which data to show
  const isSearchMode = query.length > 0 || hasFilters;
  const cards = isSearchMode
    ? searchResults.map(result => result.item)
    : cardsResponse?.data?.cards || [];
  const isLoading = isSearchMode ? searchLoading : cardsLoading;
  const error = isSearchMode ? searchError : cardsError;

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  };

  const selectAllCards = () => {
    setSelectedCards(cards.map(card => card.id));
  };

  const clearSelection = () => {
    setSelectedCards([]);
  };

  // Handle card click navigation
  const handleCardClick = (card: any, e?: React.MouseEvent) => {
    if (e) {
      // Don't navigate if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest('input[type="checkbox"]') ||
        target.closest('button') ||
        target.closest('a[href]')
      ) {
        return;
      }
    }
    navigate(`/cards/${card.id}`);
  };

  // Handle search functionality
  const handleSearch = () => {
    // Search is handled automatically by the useSearch hook
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Cards</h1>
          <p className="text-gray-600">
            {isLoading
              ? 'Loading...'
              : isSearchMode
                ? `${totalResults} search result${totalResults !== 1 ? 's' : ''} found`
                : `${cards.length} card${cards.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Scan Card
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => {
              setUseAdvancedSearch(!useAdvancedSearch);
              if (!useAdvancedSearch) {
                setSearchParams(prev => {
                  const params = new URLSearchParams(prev);
                  params.set('search', 'advanced');
                  return params;
                });
              } else {
                setSearchParams(prev => {
                  const params = new URLSearchParams(prev);
                  params.delete('search');
                  return params;
                });
              }
            }}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors',
              useAdvancedSearch
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            <Search className="h-4 w-4" />
            {useAdvancedSearch ? 'Basic Search' : 'Advanced Search'}
          </button>
        </div>
      </div>

      {/* Search Interface */}
      {useAdvancedSearch ? (
        <div className="space-y-4">
          {/* Advanced Search Bar */}
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search cards, names, companies, emails..."
            showFilters={true}
            onToggleFilters={() => setFiltersOpen(!filtersOpen)}
            filtersOpen={filtersOpen}
            hasActiveFilters={hasFilters}
            isLoading={isLoading}
            onSearch={handleSearch}
            size="md"
          />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <div className={`lg:col-span-1 ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
              <SearchFilters
                filters={filters}
                availableFilters={filterOptions}
                isLoadingFilters={isLoadingFilters}
                onAddFilter={addFilter}
                onRemoveFilter={removeFilter}
                onClearFilters={clearFilters}
                isOpen={true}
                onToggle={() => setFiltersOpen(false)}
              />
            </div>

            {/* Search Results or Card List */}
            <div className="lg:col-span-3">
              {isSearchMode ? (
                <SearchResults
                  results={searchResults}
                  isLoading={searchLoading}
                  error={searchError}
                  totalResults={totalResults}
                  executionTime={executionTime}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                  onCardClick={handleCardClick}
                  showRank={true}
                  showHighlights={true}
                />
              ) : (
                <div className="space-y-4">
                  {/* View Mode Controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">View:</span>
                      <button
                        onClick={() => setViewMode('grid')}
                        className={clsx(
                          'inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors',
                          viewMode === 'grid'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        Grid
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={clsx(
                          'inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors',
                          viewMode === 'list'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        List
                      </button>
                    </div>

                    {/* Clear search button */}
                    {(query || hasFilters) && (
                      <button
                        onClick={() => {
                          clearSearch();
                          clearFilters();
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Basic Search Mode */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search cards by name, company, or email..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">View:</span>
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors',
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors',
                  viewMode === 'list'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                List
              </button>
            </div>
          </div>

          {/* Show SearchResults component for basic search when there are search results */}
          {isSearchMode && (
            <SearchResults
              results={searchResults}
              isLoading={searchLoading}
              error={searchError}
              totalResults={totalResults}
              executionTime={executionTime}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onCardClick={handleCardClick}
              showRank={false}
              showHighlights={true}
            />
          )}
        </div>
      )}

      {/* Selection Controls */}
      {selectedCards.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedCards.length} card{selectedCards.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllCards}
                className="text-sm text-blue-700 hover:text-blue-800"
              >
                Select all
              </button>
              <button
                onClick={clearSelection}
                className="text-sm text-blue-700 hover:text-blue-800"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading your cards...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Failed to load cards</h3>
              <p className="text-sm text-red-700 mt-1">
                {error instanceof Error ? error.message : 'Something went wrong'}
              </p>
              <button
                onClick={() => refetch()}
                className="mt-2 text-sm text-red-700 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards Grid/List - Only show when not in search mode */}
      {!useAdvancedSearch && !isSearchMode && !isLoading && !error && (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map(card => (
                <div
                  key={card.id}
                  onClick={e => handleCardClick(card, e)}
                  className={clsx(
                    'bg-white rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer',
                    selectedCards.includes(card.id)
                      ? 'border-blue-300 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <input
                        type="checkbox"
                        checked={selectedCards.includes(card.id)}
                        onChange={() => toggleCardSelection(card.id)}
                        className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <button className="text-gray-400 hover:text-gray-600">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {card.name || 'Unknown Name'}
                          </h3>
                          <p className="text-sm text-gray-600">{card.title || 'No Title'}</p>
                          <p className="text-sm font-medium text-gray-700">
                            {card.company || 'No Company'}
                          </p>
                        </div>
                        {card.company && (
                          <EnrichmentStatusBadge
                            status={card.lastEnrichmentDate ? 'enriched' : 'skipped'}
                            confidence={card.lastEnrichmentDate ? 0.85 : 0}
                            size="sm"
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        {card.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <a
                              href={`mailto:${card.email}`}
                              className="text-sm text-blue-600 hover:text-blue-700 truncate"
                            >
                              {card.email}
                            </a>
                          </div>
                        )}
                        {card.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <a
                              href={`tel:${card.phone}`}
                              className="text-sm text-gray-600 hover:text-gray-700"
                            >
                              {card.phone}
                            </a>
                          </div>
                        )}
                        {card.website && (
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <a
                              href={card.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 truncate"
                            >
                              {card.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {card.tags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs text-gray-500">
                        Scanned on {formatDate((card.scanDate || card.createdAt).toString())}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="divide-y divide-gray-200">
                {cards.map(card => (
                  <div
                    key={card.id}
                    onClick={e => handleCardClick(card.id, e)}
                    className={clsx(
                      'p-6 hover:bg-gray-50 transition-colors cursor-pointer',
                      selectedCards.includes(card.id) && 'bg-blue-50'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selectedCards.includes(card.id)}
                        onChange={() => toggleCardSelection(card.id)}
                        className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-gray-900">
                                {card.name || 'Unknown Name'}
                              </h3>
                              {card.company && (
                                <EnrichmentStatusBadge
                                  status={card.lastEnrichmentDate ? 'enriched' : 'skipped'}
                                  confidence={card.lastEnrichmentDate ? 0.85 : 0}
                                  size="sm"
                                />
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              {card.title || 'No Title'} at {card.company || 'No Company'}
                            </p>
                          </div>
                          <button className="text-gray-400 hover:text-gray-600">
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4">
                          {card.email && (
                            <a
                              href={`mailto:${card.email}`}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                              <Mail className="h-4 w-4" />
                              {card.email}
                            </a>
                          )}
                          {card.phone && (
                            <a
                              href={`tel:${card.phone}`}
                              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700"
                            >
                              <Phone className="h-4 w-4" />
                              {card.phone}
                            </a>
                          )}
                          {card.website && (
                            <a
                              href={card.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                              <Globe className="h-4 w-4" />
                              {card.website.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!useAdvancedSearch && !isSearchMode && !isLoading && !error && cards.length === 0 && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No cards found</h3>
          <p className="mt-1 text-sm text-gray-500">Start by scanning your first business card</p>
          <Link
            to="/scan"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Scan Your First Card
          </Link>
        </div>
      )}
    </div>
  );
}
