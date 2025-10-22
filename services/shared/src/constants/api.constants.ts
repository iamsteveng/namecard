// API-related constants
export const API_ROUTES = {
  // Health and system
  HEALTH: '/health',
  API_INFO: '/v1',

  // Authentication routes
  AUTH: {
    BASE: '/auth',
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
  },

  // User routes
  USERS: {
    BASE: '/users',
    PROFILE: '/users/profile',
    STATS: '/users/stats',
  },

  // Card routes
  CARDS: {
    BASE: '/cards',
    SCAN: '/cards/scan',
    SEARCH: '/cards/search',
    TAGS: '/cards/tags',
    COMPANIES: '/cards/companies',
    EXPORT: '/cards/export',
    IMPORT: '/cards/import',
    BY_ID: (id: string) => `/cards/${id}`,
    ENRICH: (id: string) => `/cards/${id}/enrich`,
  },

  // Company routes
  COMPANIES: {
    BASE: '/companies',
    BY_ID: (id: string) => `/companies/${id}`,
    CARDS: (id: string) => `/companies/${id}/cards`,
    INSIGHTS: (id: string) => `/companies/${id}/insights`,
  },
} as const;

export const HTTP_STATUS = {
  // Success responses
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,

  // Client error responses
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server error responses
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',

  // Business logic errors
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  CARD_PROCESSING_FAILED: 'CARD_PROCESSING_FAILED',
  ENRICHMENT_FAILED: 'ENRICHMENT_FAILED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  IMPORT_FAILED: 'IMPORT_FAILED',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export const API_DEFAULTS = {
  // Pagination
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Limits
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CARDS_PER_USER: 10000,
  MAX_TAGS_PER_CARD: 20,

  // Timeouts
  REQUEST_TIMEOUT: 30000, // 30 seconds
  UPLOAD_TIMEOUT: 120000, // 2 minutes

  // Rate limiting
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  TEXT_PLAIN: 'text/plain',
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_PNG: 'image/png',
  IMAGE_WEBP: 'image/webp',
  PDF: 'application/pdf',
} as const;

export const ACCEPTED_IMAGE_TYPES = [
  CONTENT_TYPES.IMAGE_JPEG,
  CONTENT_TYPES.IMAGE_PNG,
  CONTENT_TYPES.IMAGE_WEBP,
] as const;

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  OPTIONS: 'OPTIONS',
  HEAD: 'HEAD',
} as const;
