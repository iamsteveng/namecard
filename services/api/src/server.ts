import app from './app.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';

const PORT = env.port;

// Start the server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server started successfully`, {
    port: PORT,
    environment: env.node,
    apiVersion: env.apiVersion,
    nodeVersion: process.version,
  });
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
