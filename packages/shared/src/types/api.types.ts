// API-specific request and response types
import type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  PaginationParams,
  SearchParams,
} from './common.types';
import type {
  Card,
  UpdateCardData,
  CardFilters,
  ScanCardRequest,
  ScanCardResponse,
  EnrichCardResponse,
  CardExportRequest,
  CardExportResponse,
  CardImportRequest,
  CardImportResponse,
} from './card.types';
import type {
  User,
  UpdateUserData,
  UserProfile,
  UserStats,
  LoginCredentials,
  RegisterData,
  UserSession,
} from './user.types';
import type { Company, CompanyFilters, CompanyInsights } from './company.types';

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================

// POST /api/v1/auth/register
export interface RegisterRequest {
  body: RegisterData;
}
export interface RegisterResponse
  extends ApiResponse<{
    user: User;
    session: UserSession;
  }> {}

// POST /api/v1/auth/login
export interface LoginRequest {
  body: LoginCredentials;
}
export interface LoginResponse
  extends ApiResponse<{
    user: User;
    session: UserSession;
  }> {}

// POST /api/v1/auth/logout
export interface LogoutRequest {
  headers: {
    authorization: string;
  };
}
export interface LogoutResponse
  extends ApiResponse<{
    message: string;
  }> {}

// POST /api/v1/auth/refresh
export interface RefreshTokenRequest {
  body: {
    refreshToken: string;
  };
}
export interface RefreshTokenResponse
  extends ApiResponse<{
    accessToken: string;
    expiresAt: Date;
  }> {}

// =============================================================================
// USER ENDPOINTS
// =============================================================================

// GET /api/v1/users/profile
export interface GetUserProfileRequest {
  headers: {
    authorization: string;
  };
}
export interface GetUserProfileResponse extends ApiResponse<UserProfile> {}

// PUT /api/v1/users/profile
export interface UpdateUserProfileRequest {
  headers: {
    authorization: string;
  };
  body: UpdateUserData;
}
export interface UpdateUserProfileResponse extends ApiResponse<User> {}

// GET /api/v1/users/stats
export interface GetUserStatsRequest {
  headers: {
    authorization: string;
  };
}
export interface GetUserStatsResponse extends ApiResponse<UserStats> {}

// =============================================================================
// CARD ENDPOINTS
// =============================================================================

// GET /api/v1/cards
export interface ListCardsRequest {
  headers: {
    authorization: string;
  };
  query: PaginationParams & SearchParams & CardFilters;
}
export interface ListCardsResponse extends PaginatedResponse<Card> {}

// GET /api/v1/cards/:id
export interface GetCardRequest {
  headers: {
    authorization: string;
  };
  params: {
    id: string;
  };
}
export interface GetCardResponse extends ApiResponse<{ card: Card }> {}

// POST /api/v1/cards/scan
export interface ScanCardApiRequest {
  headers: {
    authorization: string;
  };
  body: ScanCardRequest;
}
export interface ScanCardApiResponse extends ApiResponse<ScanCardResponse> {}

// PUT /api/v1/cards/:id
export interface UpdateCardRequest {
  headers: {
    authorization: string;
  };
  params: {
    id: string;
  };
  body: UpdateCardData;
}
export interface UpdateCardResponse
  extends ApiResponse<{
    card: Card;
    message: string;
  }> {}

// DELETE /api/v1/cards/:id
export interface DeleteCardRequest {
  headers: {
    authorization: string;
  };
  params: {
    id: string;
  };
}
export interface DeleteCardResponse
  extends ApiResponse<{
    message: string;
    cardId: string;
  }> {}

// POST /api/v1/cards/:id/enrich
export interface EnrichCardApiRequest {
  headers: {
    authorization: string;
  };
  params: {
    id: string;
  };
  body?: {
    enrichmentType?: 'company' | 'news' | 'calendar' | 'all';
  };
}
export interface EnrichCardApiResponse extends ApiResponse<EnrichCardResponse> {}

// GET /api/v1/cards/search
export interface SearchCardsRequest {
  headers: {
    authorization: string;
  };
  query: {
    q: string;
  } & PaginationParams &
    CardFilters;
}
export interface SearchCardsResponse extends PaginatedResponse<Card> {}

// GET /api/v1/cards/tags
export interface GetCardTagsRequest {
  headers: {
    authorization: string;
  };
}
export interface GetCardTagsResponse
  extends ApiResponse<{
    tags: Array<{
      name: string;
      count: number;
    }>;
  }> {}

// GET /api/v1/cards/companies
export interface GetCardCompaniesRequest {
  headers: {
    authorization: string;
  };
}
export interface GetCardCompaniesResponse
  extends ApiResponse<{
    companies: Array<{
      name: string;
      count: number;
    }>;
  }> {}

// POST /api/v1/cards/export
export interface ExportCardsRequest {
  headers: {
    authorization: string;
  };
  body: CardExportRequest;
}
export interface ExportCardsResponse extends ApiResponse<CardExportResponse> {}

// POST /api/v1/cards/import
export interface ImportCardsRequest {
  headers: {
    authorization: string;
  };
  body: CardImportRequest;
}
export interface ImportCardsResponse extends ApiResponse<CardImportResponse> {}

// =============================================================================
// COMPANY ENDPOINTS
// =============================================================================

// GET /api/v1/companies
export interface ListCompaniesRequest {
  query: PaginationParams & CompanyFilters;
}
export interface ListCompaniesResponse extends PaginatedResponse<Company> {}

// GET /api/v1/companies/:id
export interface GetCompanyRequest {
  params: {
    id: string;
  };
}
export interface GetCompanyResponse extends ApiResponse<{ company: Company }> {}

// GET /api/v1/companies/:id/cards
export interface GetCompanyCardsRequest {
  headers: {
    authorization: string;
  };
  params: {
    id: string;
  };
  query: PaginationParams;
}
export interface GetCompanyCardsResponse extends PaginatedResponse<Card> {}

// GET /api/v1/companies/:id/insights
export interface GetCompanyInsightsRequest {
  params: {
    id: string;
  };
}
export interface GetCompanyInsightsResponse extends ApiResponse<CompanyInsights> {}

// =============================================================================
// HEALTH AND SYSTEM ENDPOINTS
// =============================================================================

// GET /health
export interface HealthCheckRequest {}
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  environment: string;
  uptime?: number;
  memory?: NodeJS.MemoryUsage;
  database?: 'connected' | 'disconnected';
  error?: string;
}

// GET /api/v1
export interface ApiInfoRequest {}
export interface ApiInfoResponse
  extends ApiResponse<{
    name: string;
    version: string;
    environment: string;
  }> {}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

// Common error response types
export interface ValidationErrorResponse extends ApiError {
  error: {
    message: 'Validation failed';
    code: 'VALIDATION_ERROR';
    details: Array<{
      field: string;
      message: string;
      value?: any;
    }>;
  };
}

export interface NotFoundErrorResponse extends ApiError {
  error: {
    message: string;
    code: 'NOT_FOUND' | 'CARD_NOT_FOUND' | 'USER_NOT_FOUND' | 'COMPANY_NOT_FOUND';
  };
}

export interface UnauthorizedErrorResponse extends ApiError {
  error: {
    message: 'Unauthorized' | 'Invalid credentials' | 'Token expired';
    code: 'UNAUTHORIZED' | 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED';
  };
}

export interface RateLimitErrorResponse extends ApiError {
  error: {
    message: 'Rate limit exceeded';
    code: 'RATE_LIMIT_EXCEEDED';
    details: {
      limit: number;
      remaining: number;
      resetTime: Date;
    };
  };
}

export interface ServerErrorResponse extends ApiError {
  error: {
    message: 'Internal server error';
    code: 'INTERNAL_ERROR';
    details?: any;
  };
}

// Union type for all possible error responses
export type ApiErrorResponse =
  | ValidationErrorResponse
  | NotFoundErrorResponse
  | UnauthorizedErrorResponse
  | RateLimitErrorResponse
  | ServerErrorResponse;
