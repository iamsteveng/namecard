import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;

type PrismaLogLevel = 'info' | 'query' | 'warn' | 'error';

enum SupportedLogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

function resolveLogLevels(): PrismaLogLevel[] {
  const configured = (process.env['PRISMA_LOG_LEVEL'] ?? '').toLowerCase();

  if (configured === SupportedLogLevel.Debug) {
    return ['query', 'info', 'warn', 'error'];
  }

  if (configured === SupportedLogLevel.Info) {
    return ['info', 'warn', 'error'];
  }

  if (configured === SupportedLogLevel.Warn) {
    return ['warn', 'error'];
  }

  if (configured === SupportedLogLevel.Error) {
    return ['error'];
  }

  return ['warn', 'error'];
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: resolveLogLevels(),
  });
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
