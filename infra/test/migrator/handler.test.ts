import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { MigrationFile } from '../../migrator/handler';
import { applyMigrations, discoverMigrationFiles } from '../../migrator/handler';
import { FakeClient, normalize } from './fake-client';

describe('migrator', () => {
  describe('applyMigrations', () => {
    it('applies migrations in lexicographical order and records ledger entries', async () => {
      const migrations = buildMigrations([
        '202403011200__search__add_index.sql',
        '202401011200__auth__init.sql',
        '202402151530__cards__create_table.sql',
      ]);

      const fake = new FakeClient({ sqlToName: new Map(migrations.map((m) => [m.sql, m.name])) });

      const result = await applyMigrations(fake, migrations);

      expect(result.applied).toEqual([
        '202401011200__auth__init.sql',
        '202402151530__cards__create_table.sql',
        '202403011200__search__add_index.sql',
      ]);
      expect(fake.executedMigrations).toEqual(result.applied);
      expect(fake.insertedMigrations).toEqual(result.applied);
      expect(fake.queryLog.some((entry) => normalize(entry.text) === 'rollback')).toBe(false);
    });

    it('skips already applied migrations when checksums match', async () => {
      const migrations = buildMigrations([
        '202401011200__auth__init.sql',
        '202402151530__cards__create_table.sql',
      ]);

      const ledger = [
        { name: migrations[0].name, checksum: migrations[0].checksum },
      ];

      const fake = new FakeClient({
        sqlToName: new Map(migrations.map((m) => [m.sql, m.name])),
        ledger,
      });

      const result = await applyMigrations(fake, migrations);

      expect(result.applied).toEqual(['202402151530__cards__create_table.sql']);
      expect(result.skipped).toEqual(['202401011200__auth__init.sql']);
      expect(fake.executedMigrations).toEqual(['202402151530__cards__create_table.sql']);
    });

    it('rolls back and rethrows when a migration fails', async () => {
      const migrations = buildMigrations([
        '202401011200__auth__init.sql',
        '202402151530__cards__create_table.sql',
      ]);

      const fake = new FakeClient({
        sqlToName: new Map(migrations.map((m) => [m.sql, m.name])),
        failMigration: '202402151530__cards__create_table.sql',
      });

      await expect(applyMigrations(fake, migrations)).rejects.toThrow(
        /Failed to apply migration 202402151530__cards__create_table.sql/,
      );

      expect(fake.executedMigrations).toEqual(['202401011200__auth__init.sql']);
      expect(fake.queryLog.some((entry) => normalize(entry.text) === 'rollback')).toBe(true);
      const commitCalls = fake.queryLog.filter((entry) => normalize(entry.text) === 'commit');
      expect(commitCalls).toHaveLength(1);
      expect(fake.insertedMigrations).toEqual(['202401011200__auth__init.sql']);
      expect(fake.unlockCalls).toBe(1);
    });
  });

  describe('discoverMigrationFiles', () => {
    it('returns empty array when directory is missing', () => {
      expect(discoverMigrationFiles('/path/does/not/exist')).toEqual([]);
    });

    it('throws when filenames do not follow the required pattern', () => {
      const dir = mkdtempSync(join(tmpdir(), 'namecard-migrations-test-'));
      try {
        writeFileSync(join(dir, 'bad_migration.sql'), 'select 1;');
        expect(() => discoverMigrationFiles(dir)).toThrow(/Invalid migration filename/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

function buildMigrations(names: string[]): MigrationFile[] {
  return names
    .map((name, index) => ({
      name,
      sql: `-- migration ${name}\nselect ${index};`,
      checksum: createHash('sha256').update(`-- migration ${name}\nselect ${index};`).digest('hex'),
    }));
}
