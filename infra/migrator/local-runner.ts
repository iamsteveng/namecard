import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { handler } from './handler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const migrationsRoot = copyMigrationsToTemp();
  const cleanup = () => rmSync(migrationsRoot, { recursive: true, force: true });

  process.env.MIGRATIONS_ROOT = migrationsRoot;
  process.env.DB_HOST ??= 'localhost';
  process.env.DB_PORT ??= '5432';
  process.env.DB_USER ??= 'namecard_user';
  process.env.DB_PASSWORD ??= 'namecard_password';
  process.env.DB_NAME ??= 'namecard_dev';
  process.env.DB_SSL ??= 'false';
  process.env.MIGRATION_BATCH_ID ??= `local-${Date.now()}`;
  delete process.env.DB_SECRET_ARN;

  const event = {
    RequestType: 'Create' as const,
    ResourceProperties: {
      version: process.env.MIGRATIONS_VERSION ?? 'local',
    },
  };

  try {
    await handler(event);
    console.log('✅ Local migrations applied successfully');
  } catch (error) {
    console.error('❌ Local migrations failed', error);
    throw error;
  } finally {
    cleanup();
  }
}

function copyMigrationsToTemp(): string {
  const servicesDir = resolve(__dirname, '../../services');
  const tmpDir = mkdtempSync(join(tmpdir(), 'namecard-migrations-'));
  const serviceEntries = readdirSync(servicesDir, { withFileTypes: true });

  for (const entry of serviceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const migrationsDir = join(servicesDir, entry.name, 'migrations');
    if (!existsSync(migrationsDir)) {
      continue;
    }

    const migrationFiles = readdirSync(migrationsDir, { withFileTypes: true });
    for (const file of migrationFiles) {
      if (!file.isFile() || !file.name.endsWith('.sql')) {
        continue;
      }

      const source = join(migrationsDir, file.name);
      const destination = join(tmpDir, file.name);
      copyFileSync(source, destination);
    }
  }

  return tmpDir;
}

void main();
