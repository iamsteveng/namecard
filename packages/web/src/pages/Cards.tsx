import { clsx } from 'clsx';
import { Search, Filter, Download, MoreVertical, Mail, Phone, Globe, CheckCircle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { Card } from '@namecard/shared';
import cardService from '../services/card.service';
import { useAuthStore } from '../store/auth.store';


export default function Cards() {
  const location = useLocation();
  const { session } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle success message from navigation state
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the state to prevent showing the message on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Load cards on component mount
  useEffect(() => {
    const loadCards = async () => {
      if (!session?.accessToken) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await cardService.getCards(session.accessToken);
        setCards(data.cards);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cards');
        setCards([]);
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, [session?.accessToken]);

  const filteredCards = cards.filter(
    card =>
      card.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  };

  const selectAllCards = () => {
    setSelectedCards(filteredCards.map(card => card.id));
  };

  const clearSelection = () => {
    setSelectedCards([]);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your business cards...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-800 font-medium">{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-green-600 hover:text-green-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Cards</h1>
          <p className="text-gray-600">{filteredCards.length} cards found</p>
        </div>
        <div className="flex items-center gap-3">
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
            onChange={e => setSearchTerm(e.target.value)}
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

      {/* Cards Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map(card => (
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
                    Scanned on {card.scanDate?.toLocaleDateString() || 'Unknown date'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="divide-y divide-gray-200">
            {filteredCards.map(card => (
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
      )}

      {/* Empty State */}
      {filteredCards.length === 0 && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No cards found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? `No cards match "${searchTerm}"`
              : 'Start by scanning your first business card'}
          </p>
        </div>
      )}
    </div>
  );
}
