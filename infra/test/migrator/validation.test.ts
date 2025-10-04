import { createHash } from 'node:crypto';

import type { MigrationFile } from '../../migrator/handler.js';
import { MigrationDriftError, validateMigrations } from '../../migrator/validation.js';
import { FakeClient } from './fake-client.js';

describe('validateMigrations', () => {
  it('passes when ledger matches local migrations', async () => {
    const migrations = buildMigrations(['202401011200__auth__init.sql', '202402151530__cards__create_table.sql']);
    const fake = new FakeClient({
      ledger: migrations.map((m) => ({ name: m.name, checksum: m.checksum })),
      sqlToName: new Map(),
    });

    await expect(validateMigrations(fake, migrations)).resolves.toEqual({
      missingMigrations: [],
      checksumMismatches: [],
      unexpectedMigrations: [],
    });
    expect(fake.tryLockCalls).toBe(1);
    expect(fake.unlockCalls).toBe(1);
  });

  it('reports missing migrations when ledger is behind', async () => {
    const migrations = buildMigrations(['202401011200__auth__init.sql']);
    const fake = new FakeClient({ ledger: [], sqlToName: new Map() });

    const promise = validateMigrations(fake, migrations);
    await expect(promise).rejects.toThrow(MigrationDriftError);
    await promise.catch((error) => {
      const drift = error as MigrationDriftError;
      expect(drift.report.missingMigrations).toEqual(['202401011200__auth__init.sql']);
    });
  });

  it('reports checksum mismatches when files diverge', async () => {
    const migrations = buildMigrations(['202401011200__auth__init.sql']);
    const fake = new FakeClient({
      ledger: [{ name: migrations[0]!.name, checksum: 'different' }],
      sqlToName: new Map(),
    });

    const promise = validateMigrations(fake, migrations);
    await expect(promise).rejects.toThrow(MigrationDriftError);
    await promise.catch((error) => {
      const drift = error as MigrationDriftError;
      expect(drift.report.checksumMismatches).toEqual([
        expect.objectContaining({ name: migrations[0]!.name, actual: 'different' }),
      ]);
    });
  });

  it('fails when advisory lock cannot be acquired', async () => {
    const migrations = buildMigrations(['202401011200__auth__init.sql']);
    const fake = new FakeClient({
      ledger: migrations.map((m) => ({ name: m.name, checksum: m.checksum })),
      sqlToName: new Map(),
      tryLockSucceeds: false,
    });

    await expect(validateMigrations(fake, migrations)).rejects.toThrow(/Unable to acquire advisory lock/);
    expect(fake.tryLockCalls).toBe(1);
    expect(fake.unlockCalls).toBe(0);
  });
});

function buildMigrations(names: string[]): MigrationFile[] {
  return names.map((name, index) => ({
    name,
    sql: `-- migration ${name}\nselect ${index};`,
    checksum: createHash('sha256').update(`-- migration ${name}\nselect ${index};`).digest('hex'),
  }));
}
