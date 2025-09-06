// Database connection and client for Lambda functions
import { PrismaClient } from '@prisma/client';

// Global variable to reuse database connection across Lambda invocations
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton pattern for Prisma client in Lambda environment
export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Connection management for Lambda
export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('Database disconnected successfully');
  } catch (error) {
    console.error('Database disconnection failed:', error);
  }
}

// Lambda-specific database helpers
export async function withDatabase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await connectDatabase();
    const result = await operation();
    return result;
  } catch (error) {
    console.error('Database operation failed:', error);
    throw error;
  } finally {
    // Note: In Lambda, we might want to keep connections alive
    // for performance, so we don't always disconnect
    if (process.env.NODE_ENV === 'test') {
      await disconnectDatabase();
    }
  }
}

export default prisma;