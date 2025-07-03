// API-related constants
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
  },
  CARDS: {
    BASE: '/cards',
    SCAN: '/cards/scan',
    SEARCH: '/cards/search',
    ENRICH: (id: string) => `/cards/${id}/enrich`,
    EXPORT: '/cards/export',
    IMPORT: '/cards/import',
  },
  ANALYTICS: {
    STATS: '/analytics/stats',
    TRENDS: '/analytics/trends',
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;