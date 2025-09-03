/**
 * Search utilities for PostgreSQL full-text search
 * Handles query sanitization, processing, and tsquery building
 */

import type { SearchMode, AdvancedSearchParams } from '@namecard/shared/types/search.types';

// =============================================================================
// QUERY SANITIZATION & VALIDATION
// =============================================================================

/**
 * Sanitizes user input for PostgreSQL full-text search
 * Prevents SQL injection and validates tsquery syntax
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters
  const sanitized = query
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/[\0\b\t\n\r"'\\%]/g, '') // Remove control chars and quotes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .substring(0, 500); // Limit length

  return sanitized;
}

/**
 * Validates if a string can be safely used in a tsquery
 */
export function isValidTsQuery(query: string): boolean {
  if (!query || query.length === 0) {
    return false;
  }
  if (query.length > 500) {
    return false;
  }

  // Check for balanced parentheses
  let depth = 0;
  for (const char of query) {
    if (char === '(') {
      depth++;
    }
    if (char === ')') {
      depth--;
    }
    if (depth < 0) {
      return false;
    }
  }
  if (depth !== 0) {
    return false;
  }

  // Check for valid operators
  const invalidPatterns = [
    /&&/g, // Use & instead of &&
    /\|\|/g, // Use | instead of ||
    /!!/g, // Double negation
    /^\s*[&|!]/g, // Starting with operator
    /[&|!]\s*$/g, // Ending with operator
    /[&|!]\s*[&|!]/g, // Adjacent operators
  ];

  return !invalidPatterns.some(pattern => pattern.test(query));
}

/**
 * Escapes special characters in search terms
 */
export function escapeSearchTerm(term: string): string {
  return term
    .replace(/'/g, "''") // Escape single quotes
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/[&|!():<>]/g, '\\$&'); // Escape tsquery operators
}

// =============================================================================
// QUERY BUILDERS
// =============================================================================

/**
 * Builds a basic tsquery from search terms
 */
export function buildSimpleQuery(query: string): string {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    return '';
  }

  // Split into terms and escape each
  const terms = sanitized
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => escapeSearchTerm(term))
    .slice(0, 10); // Limit number of terms

  if (terms.length === 0) {
    return '';
  }
  if (terms.length === 1) {
    return terms[0];
  }

  // Join with AND operator for simple search
  return terms.join(' & ');
}

/**
 * Builds a boolean tsquery with AND/OR/NOT operators
 */
export function buildBooleanQuery(query: string): string {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    return '';
  }

  // Replace common boolean operators
  let processed = sanitized
    .replace(/\bAND\b/gi, ' & ')
    .replace(/\bOR\b/gi, ' | ')
    .replace(/\bNOT\b/gi, ' & !')
    .replace(/[+]/g, ' & ')
    .replace(/[-]/g, ' & !');

  // Convert spaces between words to implicit AND operations
  // Split on existing operators and spaces, then rejoin with &
  processed = processed
    .split(/\s+/)
    .filter(term => term.length > 0)
    .join(' & ');

  // Validate the resulting query
  if (!isValidTsQuery(processed)) {
    // Fallback to simple query if boolean parsing fails
    return buildSimpleQuery(sanitized);
  }

  return processed;
}

/**
 * Builds a proximity query for phrase searching
 */
export function buildProximityQuery(phrase: string, distance: number = 0): string {
  const sanitized = sanitizeSearchQuery(phrase);
  if (!sanitized) {
    return '';
  }

  const terms = sanitized
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => escapeSearchTerm(term))
    .slice(0, 5); // Limit terms in proximity search

  if (terms.length === 0) {
    return '';
  }
  if (terms.length === 1) {
    return terms[0];
  }

  if (distance === 0) {
    // Adjacent words
    return terms.join(' <-> ');
  } else {
    // Words within N distance
    return terms.join(` <${distance}> `);
  }
}

/**
 * Builds advanced query with multiple conditions
 */
export function buildAdvancedQuery(params: AdvancedSearchParams): string {
  const conditions: string[] = [];

  // Must have terms (AND)
  if (params.mustHave && params.mustHave.length > 0) {
    const mustTerms = params.mustHave
      .map((term: string) => escapeSearchTerm(sanitizeSearchQuery(term)))
      .filter((term: string) => term.length > 0)
      .slice(0, 5);
    if (mustTerms.length > 0) {
      conditions.push(`(${mustTerms.join(' & ')})`);
    }
  }

  // Should have terms (OR)
  if (params.shouldHave && params.shouldHave.length > 0) {
    const shouldTerms = params.shouldHave
      .map((term: string) => escapeSearchTerm(sanitizeSearchQuery(term)))
      .filter((term: string) => term.length > 0)
      .slice(0, 5);
    if (shouldTerms.length > 0) {
      conditions.push(`(${shouldTerms.join(' | ')})`);
    }
  }

  // Must not have terms (NOT)
  if (params.mustNotHave && params.mustNotHave.length > 0) {
    const notTerms = params.mustNotHave
      .map((term: string) => escapeSearchTerm(sanitizeSearchQuery(term)))
      .filter((term: string) => term.length > 0)
      .slice(0, 3);
    if (notTerms.length > 0) {
      conditions.push(`!(${notTerms.join(' | ')})`);
    }
  }

  // Base query from 'q' parameter
  if (params.q) {
    const baseQuery = buildSimpleQuery(params.q);
    if (baseQuery) {
      conditions.unshift(baseQuery);
    }
  }

  if (conditions.length === 0) {
    return '';
  }
  return conditions.join(' & ');
}

// =============================================================================
// SUGGESTION BUILDERS
// =============================================================================

/**
 * Builds a prefix query for suggestions/autocomplete
 */
export function buildPrefixQuery(prefix: string): string {
  const sanitized = sanitizeSearchQuery(prefix);
  if (!sanitized || sanitized.length < 2) {
    return '';
  }

  const escaped = escapeSearchTerm(sanitized);
  return `${escaped}:*`;
}

/**
 * Builds field-specific search conditions
 */
export function buildFieldSpecificQuery(query: string): string {
  const baseQuery = buildSimpleQuery(query);
  if (!baseQuery) {
    return '';
  }

  // For now, we use the same query for all fields since our search_vector
  // combines all searchable fields. Field-specific weighting is handled
  // by the setweight() function in the database triggers.
  return baseQuery;
}

// =============================================================================
// SEARCH MODE PROCESSING
// =============================================================================

/**
 * Processes query based on search mode
 */
export function processQueryByMode(query: string, mode: SearchMode): string {
  switch (mode) {
    case 'simple':
      return buildSimpleQuery(query);

    case 'boolean':
      return buildBooleanQuery(query);

    case 'proximity':
      return buildProximityQuery(query);

    case 'advanced':
      // Advanced mode requires AdvancedSearchParams
      return buildSimpleQuery(query);

    default:
      return buildSimpleQuery(query);
  }
}

// =============================================================================
// HIGHLIGHT PROCESSING
// =============================================================================

/**
 * Builds text for highlighting with ts_headline
 */
export function buildHighlightText(
  firstName?: string,
  lastName?: string,
  title?: string,
  company?: string,
  notes?: string
): string {
  const parts: string[] = [];

  if (firstName || lastName) {
    parts.push([firstName, lastName].filter(Boolean).join(' '));
  }
  if (title) {
    parts.push(title);
  }
  if (company) {
    parts.push(company);
  }
  if (notes) {
    parts.push(notes.substring(0, 200));
  } // Limit notes length

  return parts.join(' ');
}

/**
 * Extracts highlighted terms from ts_headline result
 */
export function parseHighlights(
  highlightText: string
): Array<{ text: string; highlighted: boolean }> {
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  const regex = /<b>(.*?)<\/b>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(highlightText)) !== null) {
    // Add text before highlight
    if (match.index > lastIndex) {
      parts.push({
        text: highlightText.slice(lastIndex, match.index),
        highlighted: false,
      });
    }

    // Add highlighted text
    parts.push({
      text: match[1],
      highlighted: true,
    });

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < highlightText.length) {
    parts.push({
      text: highlightText.slice(lastIndex),
      highlighted: false,
    });
  }

  return parts;
}

// =============================================================================
// QUERY ANALYTICS
// =============================================================================

/**
 * Extracts terms from a search query for analytics
 */
export function extractSearchTerms(query: string): string[] {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    return [];
  }

  return sanitized
    .toLowerCase()
    .replace(/[&|!()<>:]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 0)
    .slice(0, 10);
}

/**
 * Calculates query complexity score (0-1)
 */
export function calculateQueryComplexity(query: string): number {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    return 0;
  }

  let score = 0;

  // Base complexity from length
  score += Math.min(sanitized.length / 100, 0.3);

  // Boolean operators
  if (/[&|!]/.test(sanitized)) {
    score += 0.2;
  }

  // Proximity operators
  if (/<->|<\d+>/.test(sanitized)) {
    score += 0.2;
  }

  // Parentheses (grouping)
  if (/[()]/.test(sanitized)) {
    score += 0.15;
  }

  // Multiple terms
  const termCount = sanitized.split(/\s+/).length;
  score += Math.min(termCount / 10, 0.15);

  return Math.min(score, 1);
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class SearchQueryError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SearchQueryError';
  }
}

/**
 * Validates search parameters and throws descriptive errors
 */
export function validateSearchParams(params: any): void {
  if (params.q && typeof params.q !== 'string') {
    throw new SearchQueryError('Search query must be a string', 'INVALID_QUERY_TYPE', {
      provided: typeof params.q,
    });
  }

  if (params.q && params.q.length > 500) {
    throw new SearchQueryError('Search query too long (max 500 characters)', 'QUERY_TOO_LONG', {
      length: params.q.length,
    });
  }

  if (params.page && (isNaN(params.page) || params.page < 1)) {
    throw new SearchQueryError('Page number must be a positive integer', 'INVALID_PAGE', {
      provided: params.page,
    });
  }

  if (params.limit && (isNaN(params.limit) || params.limit < 1 || params.limit > 100)) {
    throw new SearchQueryError('Limit must be between 1 and 100', 'INVALID_LIMIT', {
      provided: params.limit,
    });
  }
}
