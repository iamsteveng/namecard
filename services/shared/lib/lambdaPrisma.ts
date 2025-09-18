import { PrismaClient } from '@prisma/client';
import { secretsService } from '../services/secrets.service';

// Lambda-optimized Prisma client with Secrets Manager integration
let prisma: PrismaClient | null = null;
let connectionPromise: Promise<void> | null = null;
let databaseUrl: string | null = null;

async function getDatabaseUrl(): Promise<string> {
  if (!databaseUrl) {
    const { url } = await secretsService.getDatabaseConfig();
    databaseUrl = url;
  }
  return databaseUrl;
}

function createPrismaClient(url: string): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === 'production'
      ? [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : ['error', 'warn'],
    errorFormat: 'minimal',
  });

  // Set up error handling
  client.$on('error' as any, (e: any) => {
    console.error('Prisma client error:', e);
  });

  // Set up query logging in development
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    client.$on('query' as any, (e: any) => {
      console.log(`Query: ${e.query}`);
      console.log(`Duration: ${e.duration}ms`);
    });
  }

  return client;
}

async function connectPrisma(): Promise<void> {
  if (!prisma) {
    const url = await getDatabaseUrl();
    prisma = createPrismaClient(url);
  }
  
  try {
    await prisma.$connect();
    console.log('Lambda: Database connection established successfully');
  } catch (error) {
    console.error('Lambda: Failed to connect to database:', error);
    throw error;
  }
}

// Get Prisma instance with connection management for Lambda
export async function getPrismaClient(): Promise<PrismaClient> {
  // Reuse existing connection if available
  if (prisma) {
    try {
      // Test connection with a simple query
      await prisma.$queryRaw`SELECT 1`;
      return prisma;
    } catch (error) {
      console.warn('Lambda: Existing connection failed, creating new one:', error);
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
    throw new Error('Lambda: Failed to establish database connection');
  }

  return prisma;
}

// Lambda-friendly disconnect function
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    connectionPromise = null;
    databaseUrl = null; // Clear cached URL
    console.log('Lambda: Database connection closed');
  }
}

// Lambda context cleanup handler - keep connections alive between invocations
export function setupLambdaCleanup(): void {
  // Only disconnect on process termination
  process.on('SIGTERM', async () => {
    await disconnectPrisma();
  });
}

// Initialize cleanup handlers
setupLambdaCleanup();

export default getPrismaClient;