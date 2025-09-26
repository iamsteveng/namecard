module.exports = {
  projects: [
    '<rootDir>/services/shared',
    '<rootDir>/services/api',
    '<rootDir>/services/workers',
  ],
  collectCoverageFrom: [
    'services/*/src/**/*.{ts,tsx}',
    '!services/*/src/**/*.d.ts',
    '!services/*/src/**/*.test.{ts,tsx}',
    '!services/*/src/**/*.spec.{ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '<rootDir>/services/*/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/services/*/src/**/*.{test,spec}.{ts,tsx}',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
  ],
};
