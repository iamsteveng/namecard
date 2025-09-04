import { clsx } from 'clsx';
import {
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  Calendar,
  Building,
  Tag,
  MapPin,
  Briefcase,
  Check,
  Loader2,
} from 'lucide-react';
import { useState, useMemo } from 'react';

import type { FilterOptions } from '@namecard/shared/types/search.types';
import type { SearchFilters } from '../../hooks/useSearch';

interface SearchFiltersProps {
  filters: SearchFilters;
  availableFilters?: FilterOptions;
  isLoadingFilters?: boolean;
  onAddFilter: (type: keyof SearchFilters, value: string) => void;
  onRemoveFilter: (type: keyof SearchFilters, value?: string) => void;
  onClearFilters: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
}

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  count?: number;
}

interface FilterOptionProps {
  label: string;
  value: string;
  count?: number;
  isSelected: boolean;
  onToggle: () => void;
}

interface FilterGroupProps {
  title: string;
  icon: React.ReactNode;
  type: keyof SearchFilters;
  options: Array<{ value: string; label: string; count: number }>;
  selectedValues: string[];
  onAddFilter: (value: string) => void;
  onRemoveFilter: (value: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  multiSelect?: boolean;
  maxVisible?: number;
}

// Individual filter option component
function FilterOption({ label, value, count, isSelected, onToggle }: FilterOptionProps) {
  return (
    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="sr-only"
      />
      <div className={clsx(
        'flex items-center justify-center w-4 h-4 border-2 rounded transition-all',
        isSelected
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'border-gray-300 hover:border-gray-400'
      )}>
        {isSelected && <Check className="h-3 w-3" />}
      </div>
      <span className="flex-1 text-sm text-gray-700 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </label>
  );
}

// Collapsible filter section
function FilterSection({ title, icon, children, isExpanded, onToggle, count }: FilterSectionProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-900">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
              {count}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
}

// Filter group component with options
function FilterGroup({
  title,
  icon,
  type,
  options,
  selectedValues,
  onAddFilter,
  onRemoveFilter,
  isExpanded,
  onToggle,
  multiSelect = true,
  maxVisible = 10,
}: FilterGroupProps) {
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = useMemo(() => {
    let filtered = options;
    
    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort by count (descending) and then by label
    filtered.sort((a, b) => {
      const aSelected = selectedValues.includes(a.value);
      const bSelected = selectedValues.includes(b.value);
      
      // Selected items first
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      
      // Then by count
      if (b.count !== a.count) return b.count - a.count;
      
      // Then alphabetically
      return a.label.localeCompare(b.label);
    });

    // Limit visible options if not showing all
    if (!showAll && filtered.length > maxVisible) {
      return filtered.slice(0, maxVisible);
    }

    return filtered;
  }, [options, searchTerm, selectedValues, showAll, maxVisible]);

  const hiddenCount = options.length - maxVisible;

  const handleOptionToggle = (value: string) => {
    const isSelected = selectedValues.includes(value);
    
    if (isSelected) {
      onRemoveFilter(value);
    } else {
      if (!multiSelect) {
        // For single select, clear existing selections first
        selectedValues.forEach(selected => onRemoveFilter(selected));
      }
      onAddFilter(value);
    }
  };

  return (
    <FilterSection
      title={title}
      icon={icon}
      isExpanded={isExpanded}
      onToggle={onToggle}
      count={selectedValues.length}
    >
      <div className="space-y-3">
        {/* Search within options */}
        {options.length > 10 && (
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Selected filters summary */}
        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedValues.map((value) => {
              const option = options.find(o => o.value === value);
              return (
                <span
                  key={value}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                >
                  {option?.label || value}
                  <button
                    onClick={() => onRemoveFilter(value)}
                    className="hover:text-blue-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Filter options */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filteredOptions.map((option) => (
            <FilterOption
              key={option.value}
              label={option.label}
              value={option.value}
              count={option.count}
              isSelected={selectedValues.includes(option.value)}
              onToggle={() => handleOptionToggle(option.value)}
            />
          ))}
        </div>

        {/* Show more/less toggle */}
        {hiddenCount > 0 && !searchTerm && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-sm text-blue-600 hover:text-blue-700 py-2 border-t border-gray-100"
          >
            {showAll ? 'Show Less' : `Show ${hiddenCount} More`}
          </button>
        )}

        {filteredOptions.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            {searchTerm ? 'No matching options found' : 'No options available'}
          </p>
        )}
      </div>
    </FilterSection>
  );
}

// Date range filter component
function DateRangeFilter({
  selectedRange,
  onSelectRange,
  onClearRange,
  isExpanded,
  onToggle,
}: {
  selectedRange?: string;
  onSelectRange: (range: string) => void;
  onClearRange: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const dateRanges = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last-7-days', label: 'Last 7 days' },
    { value: 'last-30-days', label: 'Last 30 days' },
    { value: 'last-90-days', label: 'Last 90 days' },
    { value: 'last-year', label: 'Last year' },
  ];

  return (
    <FilterSection
      title="Date Added"
      icon={<Calendar className="h-4 w-4 text-gray-600" />}
      isExpanded={isExpanded}
      onToggle={onToggle}
      count={selectedRange ? 1 : 0}
    >
      <div className="space-y-2">
        {selectedRange && (
          <div className="flex items-center justify-between mb-3 p-2 bg-blue-50 rounded">
            <span className="text-sm text-blue-700">
              {dateRanges.find(r => r.value === selectedRange)?.label}
            </span>
            <button
              onClick={onClearRange}
              className="text-blue-600 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {dateRanges.map((range) => (
          <FilterOption
            key={range.value}
            label={range.label}
            value={range.value}
            isSelected={selectedRange === range.value}
            onToggle={() => 
              selectedRange === range.value 
                ? onClearRange() 
                : onSelectRange(range.value)
            }
          />
        ))}
      </div>
    </FilterSection>
  );
}

// Main search filters component
export default function SearchFilters({
  filters,
  availableFilters,
  isLoadingFilters = false,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  isOpen = true,
  onToggle,
  className,
}: SearchFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['companies']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const hasActiveFilters = 
    filters.tags.length > 0 || 
    filters.companies.length > 0 || 
    filters.industries.length > 0 || 
    filters.dateRange;

  const totalActiveFilters = 
    filters.tags.length + 
    filters.companies.length + 
    filters.industries.length + 
    (filters.dateRange ? 1 : 0);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={clsx('bg-white border border-gray-200 rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Filters</h3>
          {totalActiveFilters > 0 && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
              {totalActiveFilters}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear all
            </button>
          )}
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters content */}
      <div className="p-4">
        {isLoadingFilters ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading filters...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Companies filter */}
            {availableFilters?.companies && availableFilters.companies.length > 0 && (
              <FilterGroup
                title="Companies"
                icon={<Building className="h-4 w-4 text-gray-600" />}
                type="companies"
                options={availableFilters.companies}
                selectedValues={filters.companies}
                onAddFilter={(value) => onAddFilter('companies', value)}
                onRemoveFilter={(value) => onRemoveFilter('companies', value)}
                isExpanded={expandedSections.has('companies')}
                onToggle={() => toggleSection('companies')}
                maxVisible={8}
              />
            )}

            {/* Tags filter */}
            {availableFilters?.tags && availableFilters.tags.length > 0 && (
              <FilterGroup
                title="Tags"
                icon={<Tag className="h-4 w-4 text-gray-600" />}
                type="tags"
                options={availableFilters.tags}
                selectedValues={filters.tags}
                onAddFilter={(value) => onAddFilter('tags', value)}
                onRemoveFilter={(value) => onRemoveFilter('tags', value)}
                isExpanded={expandedSections.has('tags')}
                onToggle={() => toggleSection('tags')}
                maxVisible={10}
              />
            )}

            {/* Industries filter */}
            {availableFilters?.industries && availableFilters.industries.length > 0 && (
              <FilterGroup
                title="Industries"
                icon={<Briefcase className="h-4 w-4 text-gray-600" />}
                type="industries"
                options={availableFilters.industries}
                selectedValues={filters.industries}
                onAddFilter={(value) => onAddFilter('industries', value)}
                onRemoveFilter={(value) => onRemoveFilter('industries', value)}
                isExpanded={expandedSections.has('industries')}
                onToggle={() => toggleSection('industries')}
                maxVisible={8}
              />
            )}

            {/* Date range filter */}
            <DateRangeFilter
              selectedRange={filters.dateRange}
              onSelectRange={(range) => onAddFilter('dateRange', range)}
              onClearRange={() => onRemoveFilter('dateRange')}
              isExpanded={expandedSections.has('dateRange')}
              onToggle={() => toggleSection('dateRange')}
            />

            {/* Locations filter placeholder */}
            {availableFilters?.locations && availableFilters.locations.length > 0 && (
              <FilterGroup
                title="Locations"
                icon={<MapPin className="h-4 w-4 text-gray-600" />}
                type="companies" // Using companies as placeholder since locations isn't in SearchFilters type
                options={availableFilters.locations}
                selectedValues={[]}
                onAddFilter={() => {}}
                onRemoveFilter={() => {}}
                isExpanded={expandedSections.has('locations')}
                onToggle={() => toggleSection('locations')}
                maxVisible={8}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}