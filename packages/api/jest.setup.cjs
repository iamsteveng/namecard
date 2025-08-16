// Jest setup for API package
// Note: @testing-library/jest-dom is not needed for backend API testing

// Global test timeout
jest.setTimeout(10000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/namecard_test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.AWS_REGION = 'us-east-1';