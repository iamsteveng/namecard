import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SearchBar from './SearchBar';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';
import { useSearch, useSearchFilters } from '../../hooks/useSearch';

export default function SearchPage() {
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // Initialize search functionality
  const {
    query,
    results,
    isLoading,
    error,
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
  } = useSearch();

  // Get available filter options
  const { 
    options: filterOptions, 
    isLoading: isLoadingFilters 
  } = useSearchFilters(query);

  const handleCardClick = (card: any) => {
    navigate(`/cards/${card.id}`);
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    setFiltersOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search Cards</h1>
          <p className="text-gray-600">
            Find your business cards using advanced search and filters
          </p>
        </div>
      </div>

      {/* Search Bar */}
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
        size="lg"
      />

      {/* Search Interface */}
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

        {/* Search Results */}
        <div className="lg:col-span-3">
          <SearchResults
            results={results}
            isLoading={isLoading}
            error={error}
            totalResults={totalResults}
            executionTime={executionTime}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onCardClick={handleCardClick}
            showRank={true}
            showHighlights={true}
          />
        </div>
      </div>
    </div>
  );
}