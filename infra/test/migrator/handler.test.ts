import { createHash } from 'crypto';

import type { MigrationFile } from '../../migrator/handler';
import { applyMigrations, discoverMigrationFiles } from '../../migrator/handler';

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

interface QueryLogEntry {
  text: string;
  values?: readonly unknown[];
}

interface FakeClientOptions {
  ledger?: Array<{ name: string; checksum?: string | null }>;
  sqlToName: Map<string, string>;
  failMigration?: string;
}

class FakeClient {
  public queryLog: QueryLogEntry[] = [];
  public executedMigrations: string[] = [];
  public insertedMigrations: string[] = [];
  public unlockCalls = 0;

  private readonly ledger: Array<{ name: string; checksum?: string | null }>;
  private readonly sqlToName: Map<string, string>;
  private readonly failMigration?: string;

  constructor(options: FakeClientOptions) {
    this.ledger = options.ledger ? [...options.ledger] : [];
    this.sqlToName = options.sqlToName;
    this.failMigration = options.failMigration;
  }

  async query(text: string, values?: readonly unknown[]) {
    this.queryLog.push({ text, values });

    const normalized = normalize(text);

    if (normalized.startsWith('create table if not exists')) {
      return { rows: [] };
    }

    if (normalized.startsWith('select pg_advisory_lock')) {
      return { rows: [] };
    }

    if (normalized.startsWith('select pg_advisory_unlock')) {
      this.unlockCalls += 1;
      return { rows: [] };
    }

    if (normalized.startsWith('select name, checksum from')) {
      return { rows: this.ledger.map((row) => ({ ...row })) };
    }

    if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
      return { rows: [] };
    }

    if (normalized.startsWith('insert into')) {
      const migrationName = typeof values?.[0] === 'string' ? (values[0] as string) : undefined;
      if (migrationName) {
        this.insertedMigrations.push(migrationName);
        this.ledger.push({ name: migrationName, checksum: values?.[1] as string });
      }
      return { rows: [] };
    }

    const migrationName = this.sqlToName.get(text) ?? this.sqlToName.get(normalized);
    if (migrationName) {
      if (this.failMigration === migrationName) {
        throw new Error(`intentional failure ${migrationName}`);
      }
      this.executedMigrations.push(migrationName);
      return { rows: [] };
    }

    throw new Error(`Unexpected query executed in test double: ${text}`);
  }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
