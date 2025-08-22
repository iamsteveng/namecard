import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// Global variable to store Prisma client instance for development hot reload
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client instance with enhanced error handling
let prisma: PrismaClient;

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: env.database.url,
    log: env.isProduction
      ? [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : env.isTest
        ? []
        : ['error', 'warn'],
    errorFormat: 'minimal',
  });

  return client;
}

if (env.isProduction) {
  // In production, create a new instance
  prisma = createPrismaClient();
} else {
  // In development/test, reuse the instance to avoid connection limits
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

// Initialize connection with retry logic
async function initializePrismaConnection(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      logger.info(`Database connection established successfully (attempt ${attempt})`);
      return;
    } catch (error) {
      logger.warn(`Database connection attempt ${attempt}/${retries} failed:`, { error });
      if (attempt === retries) {
        logger.error(
          'All database connection attempts failed. Server will continue without database operations.'
        );
        return;
      }
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

// Start connection attempt but don't block initialization
void initializePrismaConnection().catch(error => {
  logger.error('Failed to establish database connection during startup:', { error });
});

// Setup event listeners for logging (only in non-test environments)
// Temporarily disabled due to TypeScript type issues - will be fixed in future task
// if (!env.isTest) {
//   prisma.$on('query', (e: any) => {
//     logger.debug('Prisma Query', {
//       query: e.query,
//       params: e.params,
//       duration: `${e.duration}ms`,
//       target: e.target,
//     });
//   });
// }

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();
});

export default prisma;
