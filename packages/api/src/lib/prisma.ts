import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

// Global variable to store Prisma client instance for development hot reload
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client instance
let prisma: PrismaClient;

if (env.isProduction) {
  // In production, create a new instance
  prisma = new PrismaClient({
    datasourceUrl: env.database.url,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });
} else {
  // In development/test, reuse the instance to avoid connection limits
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      datasourceUrl: env.database.url,
      log: env.isTest ? [] : [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }
  prisma = global.__prisma;
}

// Setup event listeners for logging (only in non-test environments)
if (!env.isTest) {
  prisma.$on('query', (e) => {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
      target: e.target,
    });
  });

  prisma.$on('error', (e) => {
    logger.error('Prisma Error', {
      message: e.message,
      target: e.target,
    });
  });

  prisma.$on('info', (e) => {
    logger.info('Prisma Info', {
      message: e.message,
      target: e.target,
    });
  });

  prisma.$on('warn', (e) => {
    logger.warn('Prisma Warning', {
      message: e.message,
      target: e.target,
    });
  });
}

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();
});

export default prisma;