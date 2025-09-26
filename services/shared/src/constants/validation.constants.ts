// Validation-related constants
export const VALIDATION_LIMITS = {
  EMAIL: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 254,
  },
  NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100,
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
  },
  COMPANY: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 200,
  },
  PHONE: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 15,
  },
  NOTES: {
    MAX_LENGTH: 1000,
  },
  TAGS: {
    MAX_COUNT: 10,
    MAX_LENGTH: 30,
  },
  FILE: {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  },
} as const;

export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  URL: /^https?:\/\/.+\..+/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  CUID: /^c[a-z0-9]{24}$/i, // CUID format: c + 24 alphanumeric characters
  ID: /^c[a-z0-9]{24}$/i, // Use CUID format for database IDs
} as const;
