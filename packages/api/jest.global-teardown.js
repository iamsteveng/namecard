// Global teardown for API tests
module.exports = async () => {
  console.log('Tearing down test environment...');
  
  // Clean up rate limit intervals
  try {
    const { clearRateLimitCleanup } = require('./dist/middleware/rate-limit.middleware.js');
    clearRateLimitCleanup();
  } catch (error) {
    // Ignore if module not found or not built yet
  }
  
  // Force exit any remaining handles
  setTimeout(() => {
    process.exit(0);
  }, 100);
};