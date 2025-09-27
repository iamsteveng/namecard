import type { MigrationFile, PgLikeClient } from './handler.ts';
import {
  DEFAULT_LEDGER_TABLE,
  DEFAULT_LOCK_PARTITION,
  DEFAULT_LOCK_TOKEN,
  ensureLedgerTable,
  normalizeLedgerTable,
} from './handler.ts';

export interface ValidateMigrationsOptions {
  readonly ledgerTable?: string;
  readonly lockKey?: readonly [number, number];
  readonly logger?: Pick<typeof console, 'info' | 'warn' | 'error' | 'debug'>;
}

export interface MigrationDriftReport {
  readonly missingMigrations: string[];
  readonly checksumMismatches: Array<{ name: string; expected: string; actual: string | null }>;
  readonly unexpectedMigrations: Array<{ name: string; checksum: string | null }>;
}

export class MigrationDriftError extends Error {
  public readonly report: MigrationDriftReport;

  constructor(message: string, report: MigrationDriftReport) {
    super(message);
    this.report = report;
  }
}

export async function validateMigrations(
  client: PgLikeClient,
  migrations: readonly MigrationFile[],
  options: ValidateMigrationsOptions = {},
): Promise<MigrationDriftReport> {
  const logger = options.logger ?? console;
  const ledgerTable = normalizeLedgerTable(options.ledgerTable ?? DEFAULT_LEDGER_TABLE);
  const [lockPartition, lockToken] = options.lockKey ?? [DEFAULT_LOCK_PARTITION, DEFAULT_LOCK_TOKEN];

  await ensureLedgerTable(client, ledgerTable);

  const lockResult = await client.query('select pg_try_advisory_lock($1, $2) as acquired', [lockPartition, lockToken]);
  const acquired = Boolean(lockResult.rows[0]?.acquired ?? lockResult.rows[0]?.pg_try_advisory_lock);

  if (!acquired) {
    throw new Error('Unable to acquire advisory lock for validation. Another migration run may be in progress.');
  }

  try {
    const ledgerRows = await client.query(`select name, checksum from ${ledgerTable} order by name`);
    const ledger = new Map<string, string | null>();
    for (const row of ledgerRows.rows) {
      const nameValue = row.name;
      if (typeof nameValue !== 'string') {
        continue;
      }
      const checksumValue = row.checksum;
      ledger.set(nameValue, typeof checksumValue === 'string' ? checksumValue : checksumValue == null ? null : String(checksumValue));
    }

    const missingMigrations: string[] = [];
    const checksumMismatches: Array<{ name: string; expected: string; actual: string | null }> = [];
    const expectedNames = new Set<string>();

    for (const migration of migrations) {
      expectedNames.add(migration.name);
      if (!ledger.has(migration.name)) {
        missingMigrations.push(migration.name);
        continue;
      }

      const actualChecksum = ledger.get(migration.name) ?? null;
      if (actualChecksum !== migration.checksum) {
        checksumMismatches.push({ name: migration.name, expected: migration.checksum, actual: actualChecksum });
      }
    }

    const unexpectedMigrations: Array<{ name: string; checksum: string | null }> = [];
    for (const [name, checksum] of ledger.entries()) {
      if (!expectedNames.has(name)) {
        unexpectedMigrations.push({ name, checksum });
      }
    }

    const report: MigrationDriftReport = {
      missingMigrations,
      checksumMismatches,
      unexpectedMigrations,
    };

    if (missingMigrations.length || checksumMismatches.length || unexpectedMigrations.length) {
      throw new MigrationDriftError('Detected schema drift between database ledger and local migrations.', report);
    }

    logger.info('No schema drift detected; database ledger matches local migrations.');
    return report;
  } finally {
    await client
      .query('select pg_advisory_unlock($1, $2)', [lockPartition, lockToken])
      .catch((error: unknown) => logger.warn('Failed to release advisory lock during validation', { error }));
  }
}
