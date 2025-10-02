// Jest setup for shared package
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://namecard_user:namecard_password@localhost:5433/namecard_test';
process.env.AUTH_ACCESS_TOKEN_TTL = process.env.AUTH_ACCESS_TOKEN_TTL || '3600';
process.env.AUTH_REFRESH_TOKEN_TTL = process.env.AUTH_REFRESH_TOKEN_TTL || String(60 * 60 * 24 * 30);
process.env.DEV_BYPASS_TOKEN = process.env.DEV_BYPASS_TOKEN || 'dev-bypass-token';

require('@testing-library/jest-dom');
