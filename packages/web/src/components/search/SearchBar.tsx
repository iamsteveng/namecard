import { clsx } from 'clsx';
import {
  Search,
  X,
  Loader2,
  Filter,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';

import type { SearchSuggestion } from '@namecard/shared/types/search.types';
import { useSearchSuggestions } from '../../hooks/useSearch';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  showFilters?: boolean;
  onToggleFilters?: () => void;
  filtersOpen?: boolean;
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  showSuggestions?: boolean;
  onSearch?: (query: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface SuggestionItemProps {
  suggestion: SearchSuggestion;
  isHighlighted: boolean;
  onClick: () => void;
}

function SuggestionItem({ suggestion, isHighlighted, onClick }: SuggestionItemProps) {
  const getTypeIcon = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'name':
        return '👤';
      case 'company':
        return '🏢';
      case 'title':
        return '💼';
      case 'email':
        return '📧';
      case 'tags':
        return '🏷️';
      default:
        return '🔍';
    }
  };

  const getTypeLabel = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'name':
        return 'Name';
      case 'company':
        return 'Company';
      case 'title':
        return 'Job Title';
      case 'email':
        return 'Email';
      case 'tags':
        return 'Tag';
      default:
        return 'Search';
    }
  };

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
        isHighlighted
          ? 'bg-blue-50 text-blue-900'
          : 'text-gray-700 hover:bg-gray-50'
      )}
    >
      <span className="text-base">{getTypeIcon(suggestion.type)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{suggestion.text}</span>
          {suggestion.count && (
            <span className="text-xs text-gray-500">({suggestion.count})</span>
          )}
        </div>
        <span className="text-xs text-gray-500">{getTypeLabel(suggestion.type)}</span>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </button>
  );
}

export default function SearchBar({
  query,
  onQueryChange,
  placeholder = 'Search cards, names, companies...',
  showFilters = false,
  onToggleFilters,
  filtersOpen = false,
  hasActiveFilters = false,
  isLoading = false,
  showSuggestions = true,
  onSearch,
  className,
  size = 'md',
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Get search suggestions
  const { suggestions, isLoading: suggestionsLoading } = useSearchSuggestions(
    query,
    showSuggestions && isFocused && query.length >= 2
  );

  const showSuggestionsDropdown = 
    isFocused && showSuggestions && suggestions.length > 0 && query.length >= 2;

  // Handle input changes
  const handleInputChange = (value: string) => {
    onQueryChange(value);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleFocus = () => {
    setIsFocused(true);
    setHighlightedIndex(-1);
  };

  // Handle input blur (with delay to allow suggestion clicks)
  const handleBlur = () => {
    setTimeout(() => {
      setIsFocused(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestionsDropdown) {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSearch?.(query);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          const suggestion = suggestions[highlightedIndex];
          handleSuggestionSelect(suggestion);
        } else {
          onSearch?.(query);
        }
        break;
      
      case 'Escape':
        setIsFocused(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    onQueryChange(suggestion.text);
    setIsFocused(false);
    setHighlightedIndex(-1);
    onSearch?.(suggestion.text);
  };

  // Clear search
  const handleClear = () => {
    onQueryChange('');
    inputRef.current?.focus();
  };

  // Auto-scroll highlighted suggestion into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionRefs.current[highlightedIndex]) {
      suggestionRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedIndex]);

  // Size variants
  const sizeStyles = {
    sm: 'h-9 text-sm',
    md: 'h-11 text-base',
    lg: 'h-13 text-lg',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={clsx('relative w-full', className)}>
      <div className={clsx(
        'flex items-center bg-white border border-gray-300 rounded-lg transition-all',
        isFocused && 'ring-2 ring-blue-500 border-blue-500',
        sizeStyles[size]
      )}>
        {/* Search icon */}
        <div className="flex-shrink-0 pl-3 pr-2">
          {isLoading ? (
            <Loader2 className={clsx('animate-spin text-gray-400', iconSizes[size])} />
          ) : (
            <Search className={clsx('text-gray-400', iconSizes[size])} />
          )}
        </div>

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={clsx(
            'flex-1 bg-transparent border-0 focus:outline-none focus:ring-0',
            'placeholder-gray-500 text-gray-900'
          )}
          autoComplete="off"
          spellCheck="false"
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 p-1 mx-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className={iconSizes[size]} />
          </button>
        )}

        {/* Filter toggle button */}
        {showFilters && onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className={clsx(
              'flex-shrink-0 flex items-center gap-1 px-3 py-1 mx-2 text-sm font-medium rounded-md transition-all',
              filtersOpen
                ? 'bg-blue-100 text-blue-700'
                : hasActiveFilters
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            <Filter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 bg-orange-200 text-orange-800 text-xs rounded-full">
                •
              </span>
            )}
            <ChevronDown className={clsx(
              'h-4 w-4 transition-transform',
              filtersOpen && 'rotate-180'
            )} />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestionsDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading suggestions...</span>
              </div>
            ) : (
              suggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.type}-${suggestion.text}`}
                  ref={(el) => (suggestionRefs.current[index] = el)}
                >
                  <SuggestionItem
                    suggestion={suggestion}
                    isHighlighted={index === highlightedIndex}
                    onClick={() => handleSuggestionSelect(suggestion)}
                  />
                </div>
              ))
            )}
          </div>
          
          {/* Suggestions footer */}
          {suggestions.length > 0 && !suggestionsLoading && (
            <div className="border-t border-gray-100 px-3 py-2">
              <span className="text-xs text-gray-500">
                Press ↵ to search • ↑↓ to navigate • ESC to close
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}