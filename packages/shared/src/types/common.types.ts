// Common types used across the application
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
}

// Pagination types
export interface PaginationParams {
  page?: number | string;
  limit?: number | string;
  sort?: 'asc' | 'desc';
  sortBy?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
  sortBy: string;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  success: true;
  data: {
    items: T[];
    pagination: PaginationMeta;
    filters?: Record<string, any>;
  };
}

// Search and filter types
export interface SearchParams {
  q?: string;
  tags?: string | string[];
  company?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Common utility types
export type SortOrder = 'asc' | 'desc';
export type CalendarSource = 'google' | 'outlook' | 'manual';
export type CompanySize = '1-10' | '10-50' | '50-100' | '100-500' | '500-1000' | '1000+';

// JSON field types
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
  emailUpdates?: boolean;
  language?: string;
  timezone?: string;
  [key: string]: any;
}
