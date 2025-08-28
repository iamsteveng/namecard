import app from './app.js';
import { env } from './config/env.js';
import { indexingService } from './services/indexing.service.js';
import { searchService } from './services/search.service.js';
import logger from './utils/logger.js';

const PORT = env.port;

// Initialize services
async function initializeServices() {
  try {
    if (!env.isTest) {
      logger.info('Initializing search service...');
      await searchService.initialize();
      logger.info('Search service initialized successfully');

      // Populate indexes with existing data
      logger.info('Populating search indexes with existing data...');
      await indexingService.reindexAll();
      logger.info('Search indexes populated successfully');
    }
  } catch (error) {
    logger.warn('Search service initialization failed:', error);
    // Don't fail server startup if search service fails
    // The service can be used in degraded mode
  }
}

// Start the server
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server started successfully`, {
    port: PORT,
    environment: env.node,
    apiVersion: env.apiVersion,
    nodeVersion: process.version,
  });

  // Initialize services after server starts
  await initializeServices();
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close server after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

export default server;
