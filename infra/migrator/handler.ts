import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { RDSClient, DescribeDBProxyTargetsCommand } from '@aws-sdk/client-rds';
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { Client, ClientConfig } from 'pg';

const MIGRATIONS_DIR = (() => {
  const override = process.env.MIGRATIONS_ROOT ?? process.env.MIGRATIONS_DIR;
  if (override) {
    return resolve(override);
  }
  return join(process.cwd(), 'migrations');
})();
export const DEFAULT_LOCK_PARTITION = 1867;
export const DEFAULT_LOCK_TOKEN = 2401;
export const DEFAULT_LEDGER_TABLE = 'public.schema_migrations';

export const MIGRATION_FILENAME_PATTERN = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{4})__(?<service>[a-z0-9-]+)__(?<description>[a-z0-9-]+)\.sql$/;

type QueryResultRow = Record<string, unknown>;

interface OnEventRequest {
  readonly RequestType: 'Create' | 'Update' | 'Delete';
  readonly PhysicalResourceId?: string;
  readonly ResourceProperties?: Record<string, unknown>;
}

interface OnEventResponse {
  readonly PhysicalResourceId: string;
  readonly Data?: Record<string, unknown>;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
  paused: boolean;
}

export interface PgLikeClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>;
}

export interface ApplyMigrationsOptions {
  ledgerTable?: string;
  lockKey?: readonly [number, number];
  versionTag?: string | undefined;
  batchId?: string | undefined;
  now?: () => Date;
  logger?: Pick<typeof console, 'info' | 'warn' | 'error' | 'debug'>;
}

const secretsClient = new SecretsManagerClient({});
const alarmTopicArn = process.env.MIGRATION_ALARM_TOPIC_ARN ?? process.env.ALARM_TOPIC_ARN;
const snsClient = alarmTopicArn ? new SNSClient({}) : undefined;
const rdsClient = new RDSClient({});
const DEFAULT_CONNECT_ATTEMPTS = 12;
const DEFAULT_CONNECT_BASE_DELAY_MS = 10_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_PROXY_WAIT_ATTEMPTS = 60;
const DEFAULT_PROXY_WAIT_INTERVAL_MS = 10_000;

export function normalizeLedgerTable(table: string): string {
  const parts = table.split('.').filter(Boolean);
  if (parts.length === 1) {
    return `${quoteIdent('public')}.${quoteIdent(parts[0])}`;
  }

  return parts.map(quoteIdent).join('.');
}

export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function discoverMigrationFiles(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const seen = new Set<string>();
  const migrations: MigrationFile[] = [];

  for (const name of files) {
    if (!MIGRATION_FILENAME_PATTERN.test(name)) {
      throw new Error(
        `Invalid migration filename: ${name}. Expected format YYYY-MM-DDThhmm__service__description.sql with lowercase service and description segments.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate migration filename detected: ${name}`);
    }
    seen.add(name);

    const sql = readFileSync(join(dir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    migrations.push({ name, sql, checksum });
  }

  return migrations;
}

export async function applyMigrations(
  client: PgLikeClient,
  migrations: readonly MigrationFile[],
  options: ApplyMigrationsOptions = {},
): Promise<MigrationRunResult> {
  const logger = options.logger ?? console;
  const now = options.now ?? (() => new Date());
  const ledgerTable = normalizeLedgerTable(options.ledgerTable ?? DEFAULT_LEDGER_TABLE);
  const [lockPartition, lockToken] = options.lockKey ?? [DEFAULT_LOCK_PARTITION, DEFAULT_LOCK_TOKEN];
  const versionTag = options.versionTag;
  const batchId = options.batchId ?? `${versionTag ?? 'unversioned'}-${Date.now()}`;

  const applied: string[] = [];
  const skipped: string[] = [];

  if (migrations.length === 0) {
    logger.info('No migrations discovered; skipping execution.');
    return { applied, skipped, paused: false };
  }

  const orderedMigrations = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 1; i < orderedMigrations.length; i += 1) {
    if (orderedMigrations[i - 1]!.name === orderedMigrations[i]!.name) {
      throw new Error(`Duplicate migration filename detected: ${orderedMigrations[i]!.name}`);
    }
  }

  await ensureLedgerTable(client, ledgerTable);
  await client.query('select pg_advisory_lock($1, $2)', [lockPartition, lockToken]);

  try {
    const existing = await client.query(`select name, checksum from ${ledgerTable} order by name`);

    const appliedChecksums = new Map<string, string | null>();
    for (const row of existing.rows) {
      const nameValue = row.name;
      if (typeof nameValue !== 'string') {
        continue;
      }
      const checksumValue = row.checksum;
      appliedChecksums.set(
        nameValue,
        typeof checksumValue === 'string' ? checksumValue : checksumValue == null ? null : String(checksumValue),
      );
    }

    for (const migration of orderedMigrations) {
      if (appliedChecksums.has(migration.name)) {
        const alreadyAppliedChecksum = appliedChecksums.get(migration.name);
        if (alreadyAppliedChecksum && alreadyAppliedChecksum !== migration.checksum) {
          throw new Error(
            `Checksum mismatch for already applied migration ${migration.name}. ` +
              'Create a follow-up migration instead of mutating past files.',
          );
        }
        logger.info('Skipping migration already in ledger.', { migration: migration.name });
        skipped.push(migration.name);
        continue;
      }

      await client.query('begin');
      const startedAt = now();
      try {
        await client.query(migration.sql);
        const durationMs = Math.max(0, now().getTime() - startedAt.getTime());
        await client.query(
          `insert into ${ledgerTable} (name, checksum, execution_ms, batch_id, app_version)
           values ($1, $2, $3, $4, $5)`,
          [migration.name, migration.checksum, durationMs, batchId, versionTag ?? null],
        );
        await client.query('commit');
        logger.info('Applied migration.', { migration: migration.name, durationMs });
        applied.push(migration.name);
      } catch (error) {
        await client.query('rollback');
        throw augmentError(error, `Failed to apply migration ${migration.name}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1, $2)', [lockPartition, lockToken]).catch((unlockErr) => {
      logger.warn('Failed to release advisory lock', { error: unlockErr instanceof Error ? unlockErr.message : unlockErr });
    });
  }

  return { applied, skipped, paused: false };
}

function augmentError(error: unknown, message: string): Error {
  if (error instanceof Error) {
    error.message = `${message}: ${error.message}`;
    return error;
  }

  return new Error(message);
}

export async function ensureLedgerTable(client: PgLikeClient, ledgerTable: string): Promise<void> {
  await client.query(
    `create table if not exists ${ledgerTable} (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      execution_ms integer not null,
      batch_id text,
      app_version text
    )`,
  );
}

async function publishAlarm(payload: Record<string, unknown>): Promise<void> {
  if (!snsClient || !alarmTopicArn) {
    return;
  }

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: alarmTopicArn,
        Subject: 'Schema migrator failure',
        Message: JSON.stringify(payload, null, 2),
      }),
    );
  } catch (error) {
    console.error('Failed to publish migration alarm', error);
  }
}

function shouldPause(event: OnEventRequest): boolean {
  const pauseFromProps = (() => {
    const raw = (event.ResourceProperties?.pause ?? event.ResourceProperties?.paused ?? '').toString().toLowerCase();
    return raw === 'true' || raw === 'paused';
  })();

  if (pauseFromProps) {
    return true;
  }

  const mode = (process.env.MIGRATIONS_MODE ?? process.env.MIGRATION_MODE ?? '').toLowerCase();
  if (mode === 'paused' || mode === 'pause') {
    return true;
  }

  const pausedEnv = process.env.MIGRATIONS_PAUSED ?? process.env.MIGRATIONS_DISABLED;
  return pausedEnv !== undefined && ['1', 'true', 'yes'].includes(pausedEnv.toLowerCase());
}

interface DbSecretPayload {
  username?: string;
  password?: string;
  host?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
}

export interface ResolvedDatabaseConfig {
  clientConfig: ClientConfig;
  fallbackConfig?: ClientConfig;
  proxyName?: string;
  primaryEndpointType: 'proxy' | 'cluster';
}

export async function resolveDatabaseConfig(): Promise<ResolvedDatabaseConfig> {
  const secretArn = process.env.DB_SECRET_ARN;
  let secret: DbSecretPayload = {};

  if (secretArn) {
    const secretValue = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secretString = secretValue.SecretString ?? Buffer.from(secretValue.SecretBinary ?? '').toString('utf8');
    secret = secretString ? (JSON.parse(secretString) as DbSecretPayload) : {};
  }

  const proxyEndpoint = process.env.DB_PROXY_ENDPOINT;
  const clusterEndpoint = process.env.DB_CLUSTER_ENDPOINT ?? secret.host;
  const host = proxyEndpoint ?? process.env.DB_HOST ?? secret.host;
  const port = Number(process.env.DB_PORT ?? secret.port ?? 5432);
  const user = process.env.DB_USER ?? secret.username;
  const password = process.env.DB_PASSWORD ?? secret.password;
  const database = process.env.DB_NAME ?? secret.dbname ?? secret.database;

  if (!host || Number.isNaN(port) || !user || !password || !database) {
    throw new Error('Database credentials are incomplete; unable to run migrations');
  }

  const useSsl = determineSslMode(host);

  const baseConfig: ClientConfig = {
    host,
    port,
    user,
    password,
    database,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };

  const fallbackHost = proxyEndpoint && clusterEndpoint && clusterEndpoint !== proxyEndpoint ? clusterEndpoint : undefined;
  const fallbackConfig = fallbackHost
    ? {
        ...baseConfig,
        host: fallbackHost,
      }
    : undefined;

  return {
    clientConfig: baseConfig,
    fallbackConfig,
    proxyName: proxyEndpoint ? process.env.DB_PROXY_NAME ?? undefined : undefined,
    primaryEndpointType: proxyEndpoint ? 'proxy' : 'cluster',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetries(
  baseConfig: ClientConfig,
  logger: Pick<typeof console, 'info' | 'warn' | 'error'>,
  endpointLabel: string,
): Promise<Client> {
  const maxAttempts = Number(process.env.MIGRATIONS_CONNECT_ATTEMPTS ?? DEFAULT_CONNECT_ATTEMPTS);
  const baseDelayMs = Number(process.env.MIGRATIONS_CONNECT_BASE_DELAY_MS ?? DEFAULT_CONNECT_BASE_DELAY_MS);
  const connectionTimeoutMillis = Number(process.env.MIGRATIONS_CONNECT_TIMEOUT_MS ?? DEFAULT_CONNECT_TIMEOUT_MS);

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    const client = new Client({ ...baseConfig, connectionTimeoutMillis });

    try {
      await client.connect();
      logger.info('Connected to database', { attempt, endpoint: endpointLabel });
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = Math.min(120_000, baseDelayMs * Math.pow(2, attempt - 1));
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to connect to database, retrying', {
        attempt,
        maxAttempts,
        delayMs,
        message,
        endpoint: endpointLabel,
      });
      await sleep(delayMs + Math.floor(Math.random() * 1000));
    }
  }

  throw augmentError(lastError, `Unable to establish database connection via ${endpointLabel}`);
}

async function waitForProxyTargets(proxyName: string, logger: Pick<typeof console, 'info' | 'warn'>): Promise<void> {
  const maxAttempts = Number(process.env.MIGRATIONS_PROXY_WAIT_ATTEMPTS ?? DEFAULT_PROXY_WAIT_ATTEMPTS);
  const intervalMs = Number(process.env.MIGRATIONS_PROXY_WAIT_INTERVAL_MS ?? DEFAULT_PROXY_WAIT_INTERVAL_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await rdsClient.send(
        new DescribeDBProxyTargetsCommand({
          DBProxyName: proxyName,
          TargetGroupName: 'default',
        }),
      );
      const targets = response.Targets ?? [];
      if (
        targets.length > 0 &&
        targets.every((target) => target.TargetHealth?.State?.toLowerCase() === 'available')
      ) {
        logger.info('DB proxy targets are healthy', { proxyName, attempt });
        return;
      }

      const statuses = targets.map((target) => target.TargetHealth?.State ?? 'unknown');
      logger.warn('DB proxy targets not yet available', { proxyName, attempt, statuses });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to describe DB proxy targets', { proxyName, attempt, message });
    }

    await sleep(intervalMs);
  }

  throw new Error(`DB proxy targets for ${proxyName} did not become available in time`);
}

function determineSslMode(host: string): boolean {
  if (process.env.DB_SSL_MODE) {
    return ['require', 'verify-full', 'verify-ca', 'true', '1'].includes(process.env.DB_SSL_MODE.toLowerCase());
  }

  if (process.env.DB_SSL === 'false') {
    return false;
  }

  return !['localhost', '127.0.0.1'].includes(host);
}

function buildBatchId(versionTag: string | undefined): string {
  if (process.env.MIGRATION_BATCH_ID) {
    return process.env.MIGRATION_BATCH_ID;
  }

  const executionId = process.env.CODEBUILD_BUILD_ID ?? process.env.CODEPIPELINE_EXECUTION_ID ?? process.env.GITHUB_RUN_ID;
  if (executionId) {
    return `${versionTag ?? 'pipeline'}-${executionId}`;
  }

  return `${versionTag ?? 'manual'}-${Date.now()}`;
}

export const handler = async (event: OnEventRequest): Promise<OnEventResponse> => {
  const physicalId = event.PhysicalResourceId ?? 'namecard-schema-migrator';

  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: physicalId };
  }

  if (shouldPause(event)) {
    console.warn('Schema migrations paused by configuration.');
    return {
      PhysicalResourceId: physicalId,
      Data: { status: 'paused' },
    };
  }

  const logger = console;
  const migrations = discoverMigrationFiles();
  const versionTag = typeof event.ResourceProperties?.version === 'string' ? event.ResourceProperties.version : undefined;
  const batchId = buildBatchId(versionTag);

  let client: Client | undefined;

  try {
    const { clientConfig, fallbackConfig, proxyName, primaryEndpointType } = await resolveDatabaseConfig();

    if (proxyName) {
      try {
        await waitForProxyTargets(proxyName, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Proceeding without proxy readiness confirmation', { proxyName, message });
      }
    }

    try {
      client = await connectWithRetries(clientConfig, logger, primaryEndpointType);
    } catch (primaryError) {
      if (!fallbackConfig) {
        throw primaryError;
      }

      logger.warn('Primary database endpoint unavailable, falling back to cluster endpoint');
      client = await connectWithRetries(fallbackConfig, logger, 'cluster-fallback');
    }
    const result = await applyMigrations(client, migrations, {
      ledgerTable: process.env.MIGRATIONS_LEDGER_TABLE,
      lockKey: process.env.MIGRATIONS_LOCK_PARTITION && process.env.MIGRATIONS_LOCK_TOKEN
        ? [Number(process.env.MIGRATIONS_LOCK_PARTITION), Number(process.env.MIGRATIONS_LOCK_TOKEN)]
        : undefined,
      versionTag,
      batchId,
      logger,
    });

    logger.info('Migration run completed', result);

    return {
      PhysicalResourceId: physicalId,
      Data: { status: 'completed', applied: result.applied.length, skipped: result.skipped.length },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await publishAlarm({
      message: err.message,
      stack: err.stack,
      version: versionTag,
      batchId,
    });
    logger.error('Migration run failed', err);
    throw err;
  } finally {
    await client?.end().catch((endErr: unknown) => {
      logger.error('Failed to close database connection', endErr);
    });
  }
};
