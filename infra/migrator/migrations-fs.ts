import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVICES_DIR = resolve(__dirname, '../../services');

export interface StagedMigrations {
  readonly path: string;
  cleanup(): void;
}

export function stageMigrationsIntoTempRoot(): StagedMigrations {
  const tempDir = mkdtempSync(join(tmpdir(), 'namecard-migrations-'));
  const serviceEntries = readdirSync(SERVICES_DIR, { withFileTypes: true });

  for (const entry of serviceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const migrationsDir = join(SERVICES_DIR, entry.name, 'migrations');
    if (!existsSync(migrationsDir)) {
      continue;
    }

    const migrationFiles = readdirSync(migrationsDir, { withFileTypes: true });
    for (const file of migrationFiles) {
      if (!file.isFile() || !file.name.endsWith('.sql')) {
        continue;
      }

      const source = join(migrationsDir, file.name);
      const destination = join(tempDir, file.name);
      copyFileSync(source, destination);
    }
  }

  return {
    path: tempDir,
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
