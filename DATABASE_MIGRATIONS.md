# Database Migrations

The overhauled platform uses a single migrator Lambda that stitches together service-owned SQL files into a deterministic deployment bundle. Each service owns its schema changes, while the migrator guarantees ordering, ledger tracking, and concurrency safety across environments.

## Directory Layout

```
services/
  auth/
    handler.ts
    migrations/
      YYYY-MM-DDThhmm__auth__description.sql
  cards/
    handler.ts
    migrations/
      YYYY-MM-DDThhmm__cards__description.sql
  ...
```

- Every service folder may contain a `migrations/` directory with timestamped SQL files.
- Files are copied into the migrator bundle during `cdk synth/deploy` (see `infra/lib/api-stack.ts`).
- Migration names must be globally unique; the timestamp prefix plus service name enforces deterministic ordering and avoids collisions across teams.

## Naming Convention

```
YYYY-MM-DDThhmm__service__short-description.sql
```

- `YYYY-MM-DDThhmm` → 24-hour UTC timestamp (no seconds). Example: `2025-03-17T0930`.
- `service` → matches the owning service directory (`auth`, `cards`, `search`, etc.).
- `short-description` → lower-case letters, numbers, or dashes describing the change (e.g. `add-email-index`).

The migrator rejects any filename that does not follow this template.

## Tooling & Guardrails

### 1. SQL Linting (CI Gate)

`pnpm run lint:migrations`

- Executed automatically as part of `pnpm run lint:all`.
- Validates naming rules, checks for duplicate filenames, and blocks unsafe SQL patterns:
  - `DROP TABLE`, `TRUNCATE TABLE`, `ALTER TABLE ... DROP COLUMN/CONSTRAINT`
  - `UPDATE`/`DELETE` without a `WHERE` clause
  - `CREATE INDEX` without `CONCURRENTLY`
- Fails fast with actionable error messages pointing to the offending file.

### 2. Local Execution

`pnpm run db:up` → start Postgres container  
`pnpm run migrate:local` → apply migrations to the local instance (uses the migrator Lambda handler).

### 3. Drift Detection

`pnpm run migrate:validate`

- Stages migrations into a temp directory (same logic as the deploy bundle).
- Connects to the configured database (defaults to the local Docker instance) and acquires the advisory lock.
- Compares the `public.schema_migrations` ledger against local files, checking for:
  - Missing migrations (present locally, absent in DB)
  - Checksum mismatches (file changed after apply)
  - Unexpected migrations (ledger entries with no local file)
- Raises a detailed `MigrationDriftError` when differences exist; otherwise prints `✅ Schema drift check passed.`

### 4. Ledger Table

`infra/migrator/handler.ts` ensures a single table exists in every environment:

```sql
create table if not exists public.schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now(),
  execution_ms integer not null,
  batch_id text,
  app_version text
);
```

All migration runs update this ledger, enabling deterministic replay and drift detection.

## Adding a Migration

1. Ensure you are in the repository root and have Postgres running (`pnpm run db:up`).
2. Create a new SQL file under the owning service:
   ```bash
   touch services/cards/migrations/2025-03-17T0930__cards__add-company-reference.sql
   ```
3. Populate the file with **online-safe** SQL (transactional DDL, no blocking statements).
4. Run the linter: `pnpm run lint:migrations`.
5. Apply locally: `pnpm run migrate:local`.
6. Validate drift: `pnpm run migrate:validate` (should report success against your local DB).
7. Commit the SQL file alongside code changes that rely on the new schema.

## Deployment Flow

1. CI runs workspace linting/tests plus the migration linter.
2. CDK synth bundles service migrations into the migrator Lambda asset (`api-stack.ts` command hook).
3. During deploy, the migrator Lambda:
   - Discovers staged SQL files
   - Acquires an advisory lock (`pg_advisory_lock`)
   - Applies pending migrations in lexicographical order
   - Inserts ledger rows with checksums/batch IDs
4. Application Lambdas depend on the `RunMigrations` custom resource, ensuring new code does not ship until migrations complete.

## Safety Guidelines

- Treat migration files as immutable once merged; never edit an applied SQL file. Add a new file to roll forward.
- Large/backfill operations should run outside the migrator (Fargate job, Step Functions) to avoid timeouts.
- Coordinate cross-service schema changes with feature flags or expand/contract patterns.
- Always include `CONCURRENTLY` for index creation and avoid long-lived locks in schema migrations.

## Pull Request Checklist

Include this checklist (copy/paste) in any PR that ships schema changes:

- [ ] Migration filename follows `YYYY-MM-DDThhmm__service__description.sql` and lives under the correct service.
- [ ] `pnpm run lint:migrations` passes locally.
- [ ] `pnpm run migrate:local` applied cleanly against a fresh database.
- [ ] `pnpm run migrate:validate` reports no drift.
- [ ] Application code that depends on the schema change is included or guarded by a feature flag.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| `Invalid migration filename` error | Naming pattern violated | Rename file to match `YYYY-MM-DDThhmm__service__desc.sql`. |
| `Checksum mismatch` during validation | Edited an applied migration | Revert the change and ship a new forward migration. |
| `Unable to acquire advisory lock` | Concurrent migration run | Wait/retry; ensure another deploy is not in progress. |
| Local validation cannot connect | Postgres not running or credentials differ | `pnpm run db:up` and confirm environment variables (`DB_HOST`, etc.). |

This workflow keeps migrations auditable, per-service owned, and tightly integrated with infrastructure automation.
