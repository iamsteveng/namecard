import { clsx } from 'clsx';
import {
  User,
  Briefcase,
  Mail,
  Phone,
  Globe,
  MapPin,
  Tag,
  Calendar,
  Star,
  ExternalLink,
  Copy,
  Edit,
  MoreVertical,
  Loader2,
} from 'lucide-react';
import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';

import type { SearchResultItem, SearchHighlight } from '@namecard/shared/types/search.types';
import type { Card } from '@namecard/shared/types/card.types';

interface SearchResultsProps {
  results: SearchResultItem<Card>[];
  isLoading: boolean;
  error: string | null;
  totalResults: number;
  executionTime: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onCardClick?: (card: Card) => void;
  showRank?: boolean;
  showHighlights?: boolean;
  className?: string;
}

interface SearchResultCardProps {
  result: SearchResultItem<Card>;
  onClick?: ((card: Card) => void) | undefined;
  showRank?: boolean;
  showHighlights?: boolean;
}

interface HighlightedTextProps {
  text: string;
  highlights?: SearchHighlight[] | undefined;
  className?: string;
}

// Helper function to strip HTML tags for text comparison
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// Helper function to extract highlighted portion that matches the field text
// This function is now much stricter to prevent returning combined highlights for individual fields
function findMatchingHighlight(fieldText: string, highlights: SearchHighlight[]): string | null {
  if (!fieldText || !highlights?.length) return null;
  
  const fieldTextLower = fieldText.toLowerCase().trim();
  
  for (const highlight of highlights) {
    const plainHighlight = stripHtmlTags(highlight.value).toLowerCase().trim();
    const htmlHighlight = highlight.value;
    
    // Only return exact matches or very close matches (>95% similarity)
    // This prevents returning combined highlights for individual field text
    if (plainHighlight === fieldTextLower) {
      return htmlHighlight;
    }
    
    // Check for very high similarity (exact substring with minimal extra content)
    if (fieldTextLower.length > 10 && plainHighlight.includes(fieldTextLower)) {
      const similarity = fieldTextLower.length / plainHighlight.length;
      if (similarity > 0.8) { // Field text is >80% of the highlight
        return htmlHighlight;
      }
    }
  }
  
  // Return null to let the term-extraction fallback handle highlighting
  return null;
}

// Component to render highlighted text
function HighlightedText({ text, highlights, className }: HighlightedTextProps) {
  if (!highlights || highlights.length === 0 || !text) {
    return <span className={className}>{text}</span>;
  }

  // Try to find a matching highlight for this text
  const matchingHighlight = findMatchingHighlight(text, highlights);
  
  if (matchingHighlight) {
    return (
      <span 
        className={`${className} search-highlighted`}
        dangerouslySetInnerHTML={{ __html: matchingHighlight }}
      />
    );
  }

  // If no highlight matches, check if this text contains any highlighted terms
  // and try to highlight individual words
  const textLower = text.toLowerCase();
  let hasHighlightableTerms = false;
  
  for (const highlight of highlights) {
    const plainText = stripHtmlTags(highlight.value);
    // Extract bold terms from the highlight
    const boldMatches = highlight.value.match(/<b[^>]*>(.*?)<\/b>/gi);
    if (boldMatches) {
      for (const boldMatch of boldMatches) {
        const boldText = stripHtmlTags(boldMatch).toLowerCase();
        if (textLower.includes(boldText)) {
          hasHighlightableTerms = true;
          break;
        }
      }
    }
    if (hasHighlightableTerms) break;
  }
  
  if (hasHighlightableTerms) {
    // Create inline highlighting for matching terms
    let highlightedText = text;
    for (const highlight of highlights) {
      const boldMatches = highlight.value.match(/<b[^>]*>(.*?)<\/b>/gi);
      if (boldMatches) {
        for (const boldMatch of boldMatches) {
          const boldText = stripHtmlTags(boldMatch);
          const regex = new RegExp(`(${boldText})`, 'gi');
          highlightedText = highlightedText.replace(regex, '<b>$1</b>');
        }
      }
    }
    
    return (
      <span 
        className={`${className} search-highlighted`}
        dangerouslySetInnerHTML={{ __html: highlightedText }}
      />
    );
  }
  
  // Fallback to original text if no highlighting is applicable
  return <span className={className}>{text}</span>;
}

// Individual search result card component
function SearchResultCard({ result, onClick, showRank = false, showHighlights = true }: SearchResultCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const { item: card, rank, highlights } = result;

  const handleCopy = async (text: string, fieldName: string) => {
    if (navigator.clipboard && text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopySuccess(fieldName);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleCardClick = () => {
    onClick?.(card);
  };

  const getRankColor = (rank: number) => {
    if (rank >= 0.8) return 'text-green-600 bg-green-50';
    if (rank >= 0.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
      {/* Header with rank and actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Relevance rank */}
          {showRank && (
            <span className={clsx(
              'px-2 py-1 rounded-full text-xs font-medium',
              getRankColor(rank)
            )}>
              {Math.round(rank * 100)}%
            </span>
          )}
          
          {/* Card info */}
          <div onClick={handleCardClick} className="flex-1">
            <h3 className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">
              {showHighlights ? (
                <HighlightedText 
                  text={card.name || 'Unknown Name'} 
                  highlights={highlights}
                  className="text-lg"
                />
              ) : (
                card.name || 'Unknown Name'
              )}
            </h3>
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-8 z-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="py-1">
                <Link
                  to={`/cards/${card.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Details
                </Link>
                <Link
                  to={`/cards/${card.id}/edit`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Edit className="h-4 w-4" />
                  Edit Card
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-2" onClick={handleCardClick}>
        {/* Job title and company */}
        <div className="flex items-center gap-2 text-gray-600">
          <Briefcase className="h-4 w-4 flex-shrink-0" />
          <div>
            {card.title && (
              <span className="font-medium">
                {showHighlights ? (
                  <HighlightedText text={card.title} highlights={highlights} />
                ) : (
                  card.title
                )}
              </span>
            )}
            {card.title && card.company && <span className="mx-2">at</span>}
            {card.company && (
              <span className="text-blue-600">
                {showHighlights ? (
                  <HighlightedText text={card.company} highlights={highlights} />
                ) : (
                  card.company
                )}
              </span>
            )}
          </div>
        </div>

        {/* Contact info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
          {card.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {showHighlights ? (
                  <HighlightedText text={card.email} highlights={highlights} />
                ) : (
                  card.email
                )}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(card.email!, 'Email');
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {card.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <span>
                {showHighlights ? (
                  <HighlightedText text={card.phone} highlights={highlights} />
                ) : (
                  card.phone
                )}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(card.phone!, 'Phone');
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {card.website && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <a
                href={card.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {showHighlights ? (
                  <HighlightedText text={card.website} highlights={highlights} />
                ) : (
                  card.website
                )}
              </a>
            </div>
          )}

          {card.address && (
            <div className="flex items-center gap-2 md:col-span-2">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {showHighlights ? (
                  <HighlightedText text={card.address} highlights={highlights} />
                ) : (
                  card.address
                )}
              </span>
            </div>
          )}
        </div>

        {/* Tags */}
        {card.tags && card.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-gray-400" />
            {card.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
            {card.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{card.tags.length - 3} more</span>
            )}
          </div>
        )}

        {/* Notes preview */}
        {card.notes && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
            <p className="line-clamp-2">
              {showHighlights ? (
                <HighlightedText text={card.notes} highlights={highlights} />
              ) : (
                card.notes
              )}
            </p>
          </div>
        )}
      </div>

      {/* Footer with metadata */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(card.createdAt)}
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {Math.round(card.confidence * 100)}% confidence
          </div>
        </div>

        {/* Copy success feedback */}
        {copySuccess && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
            {copySuccess} copied!
          </span>
        )}
      </div>
    </div>
  );
}

// Main search results component
export default function SearchResults({
  results,
  isLoading,
  error,
  totalResults,
  executionTime,
  hasMore,
  onLoadMore,
  onCardClick,
  showRank = true,
  showHighlights = true,
  className,
}: SearchResultsProps) {
  if (error) {
    return (
      <div className={clsx('text-center py-12', className)}>
        <div className="text-red-500 mb-2">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-gray-900 font-medium">Search Error</p>
        <p className="text-gray-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!isLoading && results.length === 0) {
    return (
      <div className={clsx('text-center py-12', className)}>
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-gray-900 font-medium">No results found</p>
        <p className="text-gray-500 text-sm mt-1">Try adjusting your search terms or filters</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Results summary */}
      {!isLoading && results.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{totalResults.toLocaleString()}</span>
            <span> result{totalResults !== 1 ? 's' : ''} found</span>
            <span className="ml-2 text-gray-400">({executionTime})</span>
          </div>
        </div>
      )}

      {/* Results list */}
      <div className="space-y-4">
        {results.map((result) => (
          <SearchResultCard
            key={result.item.id}
            result={result}
            onClick={onCardClick}
            showRank={showRank}
            showHighlights={showHighlights}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More Results'
            )}
          </button>
        </div>
      )}

      {/* Loading state overlay */}
      {isLoading && results.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Searching...</span>
        </div>
      )}
    </div>
  );
}