import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient } from '@prisma/client';
import { Signer as RdsSigner } from '@aws-sdk/rds-signer';
import { createRequire } from 'node:module';
import { Client, Pool, type ClientConfig, type PoolConfig } from 'pg';

type PrismaModule = typeof import('@prisma/client');

const moduleRequire =
  typeof globalThis.require === 'function' ? globalThis.require : createRequire(__filename);

if (typeof globalThis.require !== 'function') {
  globalThis.require = moduleRequire;
}

try {
  // Ensure esbuild-generated bundles see a lexical `require`
  (0, eval)('var require = globalThis.require;');
} catch {
  // no-op if eval is unavailable
}

const prismaModule = moduleRequire('@prisma/client') as PrismaModule;
export const { Prisma } = prismaModule;
const { PrismaClient: PrismaClientCtor } = prismaModule;

let prisma: PrismaClient | undefined;

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

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

const AWS_RDS_HOST_PATTERN = /\.(rds|rdsdataservices|proxy-[^.]+)\.amazonaws\.com$/i;

interface ParsedDatabaseUrl {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
}

function parseDatabaseUrl(connectionString: string): ParsedDatabaseUrl {
  try {
    const url = new URL(connectionString);
    const database = url.pathname ? url.pathname.replace(/^\//, '') : undefined;
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: database ? decodeURIComponent(database) : undefined,
      username,
      password,
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL: ${(error as Error).message}`);
  }
}

function shouldEnforceTls(connection: ParsedDatabaseUrl): boolean {
  const override = process.env['DB_REQUIRE_TLS'];
  if (override) {
    return isTruthy(override);
  }
  return AWS_RDS_HOST_PATTERN.test(connection.host);
}

function shouldUseIamAuth(): boolean {
  const override = process.env['DB_USE_IAM_AUTH'];
  return isTruthy(override);
}

const signerCache = new Map<string, RdsSigner>();

function getRdsSigner(host: string, port: number, username: string): RdsSigner {
  const cacheKey = `${host}:${port}:${username}`;
  const cached = signerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'];
  if (!region) {
    throw new Error('AWS region is not configured; cannot generate IAM auth token');
  }

  const signer = new RdsSigner({
    region,
    hostname: host,
    port,
    username,
  });

  signerCache.set(cacheKey, signer);
  return signer;
}

function resolveDatabaseUser(parsed: ParsedDatabaseUrl): string {
  const username = parsed.username ?? process.env['DB_USER'];
  if (!username) {
    throw new Error('Database username could not be resolved');
  }
  return username;
}

function resolveDatabaseName(parsed: ParsedDatabaseUrl): string | undefined {
  return parsed.database ?? process.env['DB_NAME'];
}

function createAdapter(): PrismaPg {
  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const parsed = parseDatabaseUrl(connectionString);
  const username = resolveDatabaseUser(parsed);
  const database = resolveDatabaseName(parsed);

  const poolConfig: PoolConfig = {
    host: parsed.host,
    port: parsed.port,
    user: username,
    database,
  };

  const useTls = shouldEnforceTls(parsed);
  if (useTls) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const useIamAuth = shouldUseIamAuth();

  if (useIamAuth) {
    const signer = getRdsSigner(parsed.host, parsed.port, username);
    poolConfig.password = (): Promise<string> => signer.getAuthToken();
  } else if (parsed.password) {
    poolConfig.password = parsed.password;
  }

  console.info('[prisma-adapter] createAdapter', {
    host: parsed.host,
    port: parsed.port,
    database,
    username,
    useTls,
    useIamAuth,
    passwordLength: parsed.password?.length ?? 0,
    passwordConfigured:
      typeof poolConfig.password === 'string' ? 'static' : typeof poolConfig.password,
  });

  const pool = new Pool(poolConfig);
  return new PrismaPg(pool);
}

function createPrismaClient(): PrismaClient {
  const adapter = createAdapter();

  return new PrismaClientCtor({
    adapter,
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

function switchDatabaseUrl(targetMode: 'proxy' | 'cluster'): boolean {
  const modeEnvKey = 'DATABASE_URL_MODE';
  const currentMode = (process.env[modeEnvKey] ?? '').toLowerCase();
  if (currentMode === targetMode) {
    return false;
  }

  const targetKey = targetMode === 'proxy' ? 'DATABASE_URL_PROXY' : 'DATABASE_URL_CLUSTER';
  const targetValue = process.env[targetKey];
  if (!targetValue) {
    return false;
  }

  process.env['DATABASE_URL'] = targetValue;
  process.env[modeEnvKey] = targetMode;
  console.warn('[prisma-adapter] switched DATABASE_URL mode', { targetMode });
  return true;
}

export async function handlePrismaAuthFailure(): Promise<boolean> {
  const switched = switchDatabaseUrl('cluster');
  if (!switched) {
    return false;
  }

  await disconnectPrisma();
  await logAuthSchemaState();
  return true;
}

async function logAuthSchemaState(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    return;
  }

  try {
    const parsed = parseDatabaseUrl(connectionString);
    const config: ClientConfig = {
      host: parsed.host,
      port: parsed.port,
      user: resolveDatabaseUser(parsed),
      database: resolveDatabaseName(parsed),
      password: parsed.password,
    };

    if (shouldEnforceTls(parsed)) {
      config.ssl = { rejectUnauthorized: false };
    }

    const client = new Client(config);
    await client.connect();
    const { rows } = await client.query(
      "select table_schema, table_name from information_schema.tables where table_schema in ('auth', 'cards', 'ocr', 'enrichment', 'uploads', 'search') order by table_schema, table_name limit 100"
    );
    const ledger = await client.query(
      'select count(*)::int as count from public.schema_migrations'
    );
    console.info('[prisma-adapter] schema introspection', {
      tables: rows,
      ledgerCount: ledger.rows?.[0]?.count ?? null,
    });
    await client.end();
  } catch (error) {
    console.warn('[prisma-adapter] schema introspection failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
