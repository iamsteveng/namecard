import type { PgLikeClient } from '../../migrator/handler';

export interface QueryLogEntry {
  readonly text: string;
  readonly values?: readonly unknown[];
}

export interface FakeClientOptions {
  readonly ledger?: Array<{ name: string; checksum?: string | null }>;
  readonly sqlToName: Map<string, string>;
  readonly failMigration?: string;
  readonly tryLockSucceeds?: boolean;
}

export class FakeClient implements PgLikeClient {
  public readonly queryLog: QueryLogEntry[] = [];
  public readonly executedMigrations: string[] = [];
  public readonly insertedMigrations: string[] = [];
  public unlockCalls = 0;
  public lockCalls = 0;
  public tryLockCalls = 0;

  private readonly ledger: Array<{ name: string; checksum?: string | null }>;
  private readonly sqlToName: Map<string, string>;
  private readonly failMigration?: string;
  private readonly tryLockSucceeds: boolean;
  private lockHeld = false;

  constructor(options: FakeClientOptions) {
    this.ledger = options.ledger ? [...options.ledger] : [];
    this.sqlToName = options.sqlToName;
    this.failMigration = options.failMigration;
    this.tryLockSucceeds = options.tryLockSucceeds ?? true;
  }

  async query(text: string, values?: readonly unknown[]) {
    this.queryLog.push({ text, values });
    const normalized = normalize(text);

    if (normalized.startsWith('create table if not exists')) {
      return { rows: [] };
    }

    if (normalized.startsWith('select pg_advisory_lock')) {
      this.lockHeld = true;
      this.lockCalls += 1;
      return { rows: [] };
    }

    if (normalized.startsWith('select pg_try_advisory_lock')) {
      this.tryLockCalls += 1;
      this.lockHeld = this.tryLockSucceeds;
      return { rows: [{ acquired: this.tryLockSucceeds, pg_try_advisory_lock: this.tryLockSucceeds }] };
    }

    if (normalized.startsWith('select pg_advisory_unlock')) {
      this.lockHeld = false;
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
        const checksum = typeof values?.[1] === 'string' ? (values[1] as string) : null;
        this.ledger.push({ name: migrationName, checksum });
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

  public isLockHeld(): boolean {
    return this.lockHeld;
  }
}

export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
