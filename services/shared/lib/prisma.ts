import { PrismaClient } from '@prisma/client';
import { env } from '@shared/config/env';

// Lambda-optimized Prisma client with connection pooling
let prisma: PrismaClient | null = null;

// Connection cache for Lambda function reuse
let connectionPromise: Promise<void> | null = null;

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
    // Lambda optimization: reduce connection pool size
    // This helps prevent connection exhaustion in serverless environments
  });

  // Set up query logging in development
  if (!env.isTest && !env.isProduction) {
    client.$on('query' as any, (e: any) => {
      console.log(`Query: ${e.query}`);
      console.log(`Params: ${JSON.stringify(e.params)}`);
      console.log(`Duration: ${e.duration}ms`);
    });
  }

  return client;
}

async function connectPrisma(): Promise<void> {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  
  try {
    await prisma.$connect();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

// Get Prisma instance with connection management
export async function getPrismaClient(): Promise<PrismaClient> {
  // Reuse existing connection if available
  if (prisma) {
    try {
      // Test connection with a simple query
      await prisma.$queryRaw`SELECT 1`;
      return prisma;
    } catch (error) {
      console.warn('Existing connection failed, creating new one:', error);
      // Connection failed, reset and reconnect
      prisma = null;
      connectionPromise = null;
    }
  }

  // Create new connection if needed
  if (!connectionPromise) {
    connectionPromise = connectPrisma();
  }

  await connectionPromise;

  if (!prisma) {
    throw new Error('Failed to establish database connection');
  }

  return prisma;
}

// Lambda-friendly disconnect function
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    connectionPromise = null;
    console.log('Database connection closed');
  }
}

// Export direct access for backwards compatibility
export { prisma };

// Lambda context cleanup handler
export function setupLambdaCleanup(): void {
  // In Lambda environment, we want to keep connections alive
  // between invocations for performance, so no automatic cleanup
  if (env.isProduction) {
    // Only disconnect on process termination
    process.on('SIGTERM', async () => {
      await disconnectPrisma();
    });
  } else {
    // In development/test, clean up on exit
    process.on('beforeExit', async () => {
      await disconnectPrisma();
    });
  }
}

// Initialize cleanup handlers
setupLambdaCleanup();

export default getPrismaClient;