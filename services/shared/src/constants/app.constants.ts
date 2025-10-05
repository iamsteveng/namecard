// Application-specific constants and enums

// Company size categories
export const COMPANY_SIZES = {
  MICRO: '1-10',
  SMALL: '10-50',
  MEDIUM: '50-100',
  LARGE: '100-500',
  ENTERPRISE: '500-1000',
  MEGA: '1000+',
} as const;

export type CompanySizeValue = (typeof COMPANY_SIZES)[keyof typeof COMPANY_SIZES];

// Calendar integration sources
export const CALENDAR_SOURCES = {
  GOOGLE: 'google',
  OUTLOOK: 'outlook',
  MANUAL: 'manual',
} as const;

export type CalendarSourceValue = (typeof CALENDAR_SOURCES)[keyof typeof CALENDAR_SOURCES];

// User theme preferences
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemeValue = (typeof THEMES)[keyof typeof THEMES];

// Sort order options
export const SORT_ORDERS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortOrderValue = (typeof SORT_ORDERS)[keyof typeof SORT_ORDERS];

// Card export formats
export const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  VCARD: 'vcard',
} as const;

export type ExportFormatValue = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS];

// Card import formats
export const IMPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
} as const;

export type ImportFormatValue = (typeof IMPORT_FORMATS)[keyof typeof IMPORT_FORMATS];

// Enrichment types
export const ENRICHMENT_TYPES = {
  COMPANY: 'company',
  NEWS: 'news',
  CALENDAR: 'calendar',
  ALL: 'all',
} as const;

export type EnrichmentTypeValue = (typeof ENRICHMENT_TYPES)[keyof typeof ENRICHMENT_TYPES];

// Activity types for user activity tracking
export const ACTIVITY_TYPES = {
  CARD_CREATED: 'card_created',
  CARD_UPDATED: 'card_updated',
  CARD_ENRICHED: 'card_enriched',
  CARD_DELETED: 'card_deleted',
  CARD_EXPORTED: 'card_exported',
  CARD_IMPORTED: 'card_imported',
  PROFILE_UPDATED: 'profile_updated',
} as const;

export type ActivityTypeValue = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

// News sentiment classifications
export const NEWS_SENTIMENTS = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
} as const;

export type NewsSentimentValue = (typeof NEWS_SENTIMENTS)[keyof typeof NEWS_SENTIMENTS];

// Data source types for company enrichment
export const DATA_SOURCE_TYPES = {
  CRUNCHBASE: 'crunchbase',
  CLEARBIT: 'clearbit',
  LINKEDIN: 'linkedin',
  MANUAL: 'manual',
} as const;

export type DataSourceTypeValue = (typeof DATA_SOURCE_TYPES)[keyof typeof DATA_SOURCE_TYPES];

// Default values for UI and business logic
export const DEFAULTS = {
  // Pagination
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Card processing
  MIN_OCR_CONFIDENCE: 0.5,
  DEFAULT_OCR_CONFIDENCE: 0.8,

  // File constraints
  MAX_FILE_SIZE_MB: 10,
  MAX_IMAGE_DIMENSION: 4096,

  // Text limits
  MAX_CARD_NAME_LENGTH: 100,
  MAX_COMPANY_NAME_LENGTH: 200,
  MAX_NOTES_LENGTH: 2000,
  MAX_TAG_LENGTH: 50,
  MAX_TAGS_PER_CARD: 20,

  // User preferences
  DEFAULT_THEME: THEMES.SYSTEM,
  DEFAULT_LANGUAGE: 'en',
  DEFAULT_TIMEZONE: 'UTC',

  // Search and filtering
  MIN_SEARCH_LENGTH: 2,
  MAX_SEARCH_LENGTH: 100,
  SEARCH_DEBOUNCE_MS: 300,

  // Cache and sync
  CACHE_TTL_HOURS: 24,
  SYNC_INTERVAL_HOURS: 6,
  MAX_RETRY_ATTEMPTS: 3,
} as const;

// Common industry categories
export const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Manufacturing',
  'Retail',
  'Consulting',
  'Real Estate',
  'Media & Entertainment',
  'Non-profit',
  'Government',
  'Energy',
  'Transportation',
  'Hospitality',
  'Agriculture',
  'Construction',
  'Legal',
  'Marketing & Advertising',
  'Other',
] as const;

export type IndustryValue = (typeof INDUSTRIES)[number];

// Supported languages for localization
export const SUPPORTED_LANGUAGES = {
  EN: 'en',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  JA: 'ja',
  ZH: 'zh',
  PT: 'pt',
  IT: 'it',
  RU: 'ru',
  KO: 'ko',
} as const;

export type LanguageValue = (typeof SUPPORTED_LANGUAGES)[keyof typeof SUPPORTED_LANGUAGES];

// Common error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit.',
  INVALID_FILE_TYPE: 'Invalid file type. Please select a supported format.',
  CARD_PROCESSING_FAILED: 'Failed to process the business card.',
  ENRICHMENT_FAILED: 'Failed to enrich card data.',
  EXPORT_FAILED: 'Failed to export cards.',
  IMPORT_FAILED: 'Failed to import cards.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  CARD_CREATED: 'Business card created successfully.',
  CARD_UPDATED: 'Business card updated successfully.',
  CARD_DELETED: 'Business card deleted successfully.',
  CARD_ENRICHED: 'Card data enriched successfully.',
  CARDS_EXPORTED: 'Cards exported successfully.',
  CARDS_IMPORTED: 'Cards imported successfully.',
  PROFILE_UPDATED: 'Profile updated successfully.',
  PASSWORD_CHANGED: 'Password changed successfully.',
} as const;
