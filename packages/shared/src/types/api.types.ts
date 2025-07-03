// API-specific types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
