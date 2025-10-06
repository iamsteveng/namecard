import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { discoverMigrationFiles, resolveDatabaseConfig } from './handler.js';
import { stageMigrationsIntoTempRoot } from './migrations-fs.js';
import { MigrationDriftError, validateMigrations } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const staged = stageMigrationsIntoTempRoot();
  process.env.MIGRATIONS_ROOT = staged.path;
  process.env.DB_HOST ??= 'localhost';
  process.env.DB_PORT ??= '5432';
  process.env.DB_USER ??= 'namecard_user';
  process.env.DB_PASSWORD ??= 'namecard_password';
  process.env.DB_NAME ??= 'namecard_dev';
  process.env.DB_SSL ??= 'false';
  delete process.env.DB_SECRET_ARN;

  let client: Client | undefined;

  try {
    const migrations = discoverMigrationFiles(staged.path);

    const { clientConfig } = await resolveDatabaseConfig();
    client = new Client(clientConfig);
    await client.connect();

    await validateMigrations(client, migrations, { logger: console });
    console.log('✅ Schema drift check passed.');
  } catch (error) {
    if (error instanceof MigrationDriftError) {
      console.error('❌ Schema drift detected between database ledger and local migrations.');
      if (error.report.missingMigrations.length) {
        console.error('   Missing migrations (present locally, absent in database):');
        for (const name of error.report.missingMigrations) {
          console.error(`     - ${name}`);
        }
      }
      if (error.report.checksumMismatches.length) {
        console.error('   Checksum mismatches (database checksum differs from local file):');
        for (const mismatch of error.report.checksumMismatches) {
          console.error(`     - ${mismatch.name} (expected ${mismatch.expected}, actual ${mismatch.actual ?? 'null'})`);
        }
      }
      if (error.report.unexpectedMigrations.length) {
        console.error('   Unexpected migrations recorded in database (no matching local file):');
        for (const unexpected of error.report.unexpectedMigrations) {
          console.error(`     - ${unexpected.name}`);
        }
      }
      process.exitCode = 1;
      return;
    }

    console.error('❌ Migration validation failed.', error);
    process.exitCode = 1;
  } finally {
    await client?.end().catch((err) => console.error('Failed to close validation client', err));
    staged.cleanup();
    delete process.env.MIGRATIONS_ROOT;
  }
}

void main();
