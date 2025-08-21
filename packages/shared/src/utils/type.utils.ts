// Type utility functions and helper types

// Utility type to extract the value type from const assertions
export type ValueOf<T> = T[keyof T];

// Utility type to make specific properties optional
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Utility type to make specific properties required
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Utility type for deep partial (makes all nested properties optional)
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Utility type for strict object keys (no excess properties)
export type Exact<T, U extends T> = T & Record<Exclude<keyof U, keyof T>, never>;

// Utility type to create a union from array values
export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

// Utility type to exclude null and undefined
export type NonNullable<T> = T extends null | undefined ? never : T;

// Utility type for function parameter extraction
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any
  ? P
  : never;

// Utility type for function return type extraction
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R
  ? R
  : any;

// Utility type for promise resolution type
export type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

// API response utility types
export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
  timestamp?: string;
};

export type ApiFailure = {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// Form state utility types
export type FormState<T> = {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
};

// Pagination utility types
export type PaginationState = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type SortState<T extends string = string> = {
  field: T;
  direction: 'asc' | 'desc';
};

export type FilterState<T = Record<string, any>> = {
  filters: T;
  activeCount: number;
};

// Loading state utility types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export type AsyncState<T, E = Error> = {
  data: T | null;
  loading: boolean;
  error: E | null;
  lastFetch?: Date;
};

// Entity state utility types
export type EntityState<T> = {
  entities: Record<string, T>;
  ids: string[];
  loading: boolean;
  error: string | null;
};

// Search utility types
export type SearchState<T> = {
  query: string;
  results: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
};

// File upload utility types
export type FileUploadState = {
  file: File | null;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error: string | null;
  url?: string;
};

// Validation utility types
export type ValidationRule<T = any> = {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
};

export type ValidationSchema<T> = {
  [K in keyof T]?: ValidationRule<T[K]>;
};

export type ValidationResult = {
  isValid: boolean;
  errors: Record<string, string>;
};

// Type guards utility functions
export const isApiSuccess = <T>(result: ApiResult<T>): result is ApiSuccess<T> => {
  return result.success === true;
};

export const isApiFailure = <T>(result: ApiResult<T>): result is ApiFailure => {
  return result.success === false;
};

export const isNonNull = <T>(value: T | null | undefined): value is T => {
  return value !== null && value !== undefined;
};

export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
};

export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isArray = <T>(value: unknown): value is T[] => {
  return Array.isArray(value);
};

export const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

// Utility functions for common operations
export const pick = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};

export const omit = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
};

export const groupBy = <T, K extends string | number | symbol>(
  array: T[],
  getKey: (item: T) => K
): Record<K, T[]> => {
  return array.reduce(
    (groups, item) => {
      const key = getKey(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<K, T[]>
  );
};

export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const uniq = <T>(array: T[]): T[] => {
  return Array.from(new Set(array));
};

export const uniqBy = <T, K>(array: T[], getKey: (item: T) => K): T[] => {
  const seen = new Set<K>();
  return array.filter(item => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
