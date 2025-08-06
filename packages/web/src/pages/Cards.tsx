import { clsx } from 'clsx';
import { Search, Filter, Download, MoreVertical, Mail, Phone, Globe, Loader2, AlertCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import cardsService, { type Card } from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';


export default function Cards() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;

  // Fetch cards with React Query
  const {
    data: cardsResponse,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['cards', currentPage, searchTerm],
    queryFn: () => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      
      const params: any = {
        page: currentPage,
        limit: 20,
        sort: 'desc',
        sortBy: 'createdAt'
      };
      
      if (searchTerm.trim()) {
        return cardsService.searchCards(searchTerm.trim(), accessToken, {
          ...params,
          page: currentPage,
          limit: 20
        });
      }
      
      return cardsService.getCards(accessToken, params);
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const cards = cardsResponse?.data?.cards || [];
  const pagination = cardsResponse?.data?.pagination;

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

  // Handle search with debouncing effect
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
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
            {isLoading ? 'Loading...' : `${pagination?.total || 0} card${(pagination?.total || 0) !== 1 ? 's' : ''} found`}
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
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search cards by name, company, or email..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">View:</span>
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'px-3 py-2 text-sm rounded-lg transition-colors',
              viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'px-3 py-2 text-sm rounded-lg transition-colors',
              viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            List
          </button>
        </div>
      </div>

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

      {/* Cards Grid/List */}
      {!isLoading && !error && (
        viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(card => (
            <div
              key={card.id}
              className={clsx(
                'bg-white rounded-lg border transition-all duration-200 hover:shadow-md',
                selectedCards.includes(card.id)
                  ? 'border-blue-300 ring-2 ring-blue-100'
                  : 'border-gray-200'
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
                  <div>
                    <h3 className="font-semibold text-gray-900">{card.name || 'Unknown Name'}</h3>
                    <p className="text-sm text-gray-600">{card.title || 'No Title'}</p>
                    <p className="text-sm font-medium text-gray-700">{card.company || 'No Company'}</p>
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
                    Scanned on {formatDate(card.scanDate)}
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
                className={clsx(
                  'p-6 hover:bg-gray-50 transition-colors',
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
                        <h3 className="font-semibold text-gray-900">{card.name || 'Unknown Name'}</h3>
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
      )
      )}

      {/* Empty State */}
      {!isLoading && !error && cards.length === 0 && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No cards found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? `No cards match "${searchTerm}"`
              : 'Start by scanning your first business card'}
          </p>
          {!searchTerm && (
            <Link
              to="/scan"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Scan Your First Card
            </Link>
          )}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={!pagination.hasPrev}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
              disabled={!pagination.hasNext}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">{Math.min((currentPage - 1) * (pagination.limit || 20) + 1, pagination.total)}</span>
                {' '}to{' '}
                <span className="font-medium">{Math.min(currentPage * (pagination.limit || 20), pagination.total)}</span>
                {' '}of{' '}
                <span className="font-medium">{pagination.total}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={!pagination.hasPrev}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(pagination.totalPages - 4, currentPage - 2)) + i;
                  if (pageNum > pagination.totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={clsx(
                        'relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0',
                        pageNum === currentPage
                          ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                  disabled={!pagination.hasNext}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
