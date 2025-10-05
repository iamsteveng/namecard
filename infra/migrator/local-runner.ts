import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stageMigrationsIntoTempRoot } from './migrations-fs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const staged = stageMigrationsIntoTempRoot();
  const migrationsRoot = staged.path;

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
    const { handler } = await import('./handler.js');
    await handler(event);
    console.log('✅ Local migrations applied successfully');
  } catch (error) {
    console.error('❌ Local migrations failed', error);
    throw error;
  } finally {
    staged.cleanup();
  }
}

void main();
