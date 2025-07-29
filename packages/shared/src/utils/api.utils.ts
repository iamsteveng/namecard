// API utility functions and helpers
import type { PaginationParams, SearchParams } from '../types/common.types.js';
import { API_DEFAULTS } from '../constants/api.constants.js';

// URL and query parameter utilities
export const buildQueryString = (params: Record<string, any>): string => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, String(item)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const buildApiUrl = (baseUrl: string, path: string, params?: Record<string, any>): string => {
  const url = new URL(path, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(item => url.searchParams.append(key, String(item)));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });
  }
  
  return url.toString();
};

// Pagination utilities
export const normalizePaginationParams = (params: PaginationParams) => {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(
    API_DEFAULTS.MAX_PAGE_SIZE,
    Math.max(1, Number(params.limit) || API_DEFAULTS.PAGE_SIZE)
  );
  const sort = params.sort === 'asc' ? 'asc' : 'desc';
  const sortBy = params.sortBy || 'createdAt';
  
  return { page, limit, sort, sortBy };
};

export const calculatePaginationMeta = (
  page: number,
  limit: number,
  total: number
) => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
  };
};

export const getOffsetFromPage = (page: number, limit: number): number => {
  return (page - 1) * limit;
};

export const getPageFromOffset = (offset: number, limit: number): number => {
  return Math.floor(offset / limit) + 1;
};

// Search utilities
export const normalizeSearchParams = (params: SearchParams) => {
  const normalized: SearchParams = {};
  
  if (params.q && params.q.trim()) {
    normalized.q = params.q.trim();
  }
  
  if (params.tags) {
    if (Array.isArray(params.tags)) {
      normalized.tags = params.tags.filter(tag => tag.trim());
    } else if (params.tags.trim()) {
      normalized.tags = [params.tags.trim()];
    }
  }
  
  if (params.company && params.company.trim()) {
    normalized.company = params.company.trim();
  }
  
  if (params.dateFrom) {
    normalized.dateFrom = params.dateFrom;
  }
  
  if (params.dateTo) {
    normalized.dateTo = params.dateTo;
  }
  
  return normalized;
};

// Request helpers
export const createAuthHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const createFormDataHeaders = (token?: string) => {
  const headers: Record<string, string> = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Don't set Content-Type for FormData - browser will set it with boundary
  return headers;
};

export const createJsonHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Response helpers
export const extractErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  if (error?.error?.message) {
    return error.error.message;
  }
  
  return 'An unexpected error occurred';
};

export const isNetworkError = (error: any): boolean => {
  return (
    !error.response ||
    error.code === 'NETWORK_ERROR' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT'
  );
};

export const getHttpStatusFromError = (error: any): number | null => {
  return error?.response?.status || error?.status || null;
};

// Retry utilities
export const createRetryConfig = (maxRetries = 3, baseDelay = 1000) => ({
  maxRetries,
  baseDelay,
  maxDelay: baseDelay * 10,
  backoffFactor: 2,
});

export const calculateRetryDelay = (
  attempt: number,
  baseDelay: number,
  backoffFactor: number,
  maxDelay: number
): number => {
  const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelay);
};

export const shouldRetry = (
  error: any,
  attempt: number,
  maxRetries: number
): boolean => {
  if (attempt >= maxRetries) return false;
  
  const status = getHttpStatusFromError(error);
  
  // Retry on network errors
  if (isNetworkError(error)) return true;
  
  // Retry on 5xx server errors
  if (status && status >= 500) return true;
  
  // Retry on 429 (too many requests)
  if (status === 429) return true;
  
  return false;
};

// Debounce utility for search
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T => {
  let timeoutId: NodeJS.Timeout;
  
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

// Throttle utility for API calls
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T => {
  let lastCall = 0;
  
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func(...args);
    }
  }) as T;
};

// File upload utilities
export const validateFileType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

export const validateFileSize = (file: File, maxSizeBytes: number): boolean => {
  return file.size <= maxSizeBytes;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Cache utilities
export const createCacheKey = (...parts: (string | number)[]): string => {
  return parts.join(':');
};

export const isValidCacheEntry = <T>(
  entry: { data: T; timestamp: number; ttl: number } | null
): entry is { data: T; timestamp: number; ttl: number } => {
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttl;
};

// Environment utilities
export const isDevelopment = (): boolean => {
  return process.env['NODE_ENV'] === 'development';
};

export const isProduction = (): boolean => {
  return process.env['NODE_ENV'] === 'production';
};

export const isTest = (): boolean => {
  return process.env['NODE_ENV'] === 'test';
};