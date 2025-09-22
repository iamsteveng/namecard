# Serverless Backend Architecture Plan (CDK + TypeScript + Monorepo)

This document outlines the backend architecture plan for managing multiple AWS Lambda functions in a **TypeScript monorepo**, with **per-service database migrations** and mitigations for common Lambda pitfalls.

The existing backend infra will be completely deleted. Codebase structure will also be revamped.

---

## 1. Monorepo Structure

```text
root/
  infra/
    bin/app.ts
    lib/db-stack.ts
    lib/api-stack.ts
    migrator/
      handler.ts        # central migrator Lambda
  services/
    users/
      handler.ts
      migrations/
        2025-09-21T1200__users__init.sql
    orders/
      handler.ts
      migrations/
        2025-09-22T0905__orders__add_index.sql
```

- Each service is self-contained (handler + migrations).
- No shared `packages/*` unless absolutely necessary (keeps services loosely coupled).
- Database migrations are **owned by each service** but **executed centrally** by a migrator Lambda at deploy time.

---

## 2. Infrastructure with CDK

- **CDK stacks**:
  - `DbStack`: Amazon RDS for PostgreSQL + Secrets Manager.
  - `ApiStack`: multiple Lambdas + migrator Lambda + Custom Resource.

- **Migrations**:
  - On deploy, the migrator collects all `services/*/migrations/`.
  - Filenames follow `YYYY-MM-DDThhmm__service__desc.sql`.
  - Files are sorted, applied in order, recorded in a `schema_migrations` table, and guarded with an **advisory lock** to prevent races.
  - App Lambdas depend on the migration resource: **code only goes live once schema changes are applied**.

---

## 3. Database Pattern

- **One database instance**, shared across all services.
- Services may create their own tables (prefixed or namespaced).
- Optionally, use **Postgres schemas per service** (`users.*`, `orders.*`) for clearer boundaries.
- **Migrations are append-only**. Never edit applied files; always add new ones.

---

## 4. Common Pitfalls & Mitigations

### 4.1 Database Connection Storms
- Use **tiny pools** (`max: 2–3`) per Lambda, reuse across invocations.
- Add **RDS Proxy** for connection multiplexing.
- Apply **reserved concurrency** limits per function.

### 4.2 Migration Races / Ordering
- Centralized migrator with timestamped filenames + advisory lock.
- Idempotent `schema_migrations` ledger.
- Functions depend on migration completion.

### 4.3 Long / Locking Migrations
- Migrator is only for **small, online schema changes**.
- Heavy backfills or locking DDL run as **manual jobs** (Fargate/Step Functions).
- CI guardrails to block unsafe SQL (`UPDATE` without `WHERE`, non-concurrent indexes).

### 4.4 Cold Starts & VPC Latency
- Use **Node.js 20** with esbuild bundling for small, tree-shaken bundles.
- Lambdas placed in same VPC/subnet as RDS.
- **Provisioned Concurrency** on latency-critical endpoints.

### 4.5 Package Bloat & Native Deps
- Esbuild bundling via `NodejsFunction`.
- Avoid bundling AWS SDK (already present).
- Large/common deps (like `pg`) can go in a **Lambda Layer**.

### 4.6 Secrets & Config
- Database creds stored in **Secrets Manager**.
- Fetched once and **cached in memory** across invocations.
- Rotations supported via RDS Proxy.

### 4.7 Timeouts, Retries, Idempotency
- Function timeouts set shorter than event source timeouts.
- **Idempotency tokens** for write endpoints.
- DLQ or failure destinations configured for async sources.

### 4.8 Concurrency Explosions
- Reserved concurrency set per function.
- Tune event sources (e.g. SQS batch size).
- RDS Proxy to smooth spikes.

### 4.9 Observability
- **Structured JSON logs** per function (service, fn, reqId, latency).
- **CloudWatch Alarms** on errors, throttles, DLQ depth.
- Enable **X-Ray tracing** for DB calls.

### 4.10 API Payload Limits
- Use S3 presigned URLs for large uploads/downloads.
- Keep API Gateway payloads <10 MB.

### 4.11 IAM Blast Radius
- Each function gets a **narrow IAM role** (read its DB secret, VPC access).
- No wildcards (`*`) for Secrets or resources.

### 4.12 Multi-Env Consistency
- CDK context and parameters used for stage/prod differences.
- Migrations applied consistently across all environments.

### 4.13 Rollback Hazards
- Expand → deploy → contract migration strategy.
- Rollback-safe since code waits for schema.
- Manual procedure documented for failed migrations.

### 4.14 Cross-Service Coupling
- Ownership visible in migration filenames.
- Optionally, use schemas per service to enforce separation.

### 4.15 Testing
- Local dev with Dockerized Postgres.
- CI runs migrations + integration tests before merge.
- Preview stacks with small AWS RDS instance for PR validation.

---

## 5. Deployment Flow

1. Developer adds code + migration in their service folder.
2. CI/CD builds with esbuild, runs tests, lints migrations.
3. CDK deploy:
   - Migrator Lambda bundles all migrations.
   - Custom Resource runs new migrations under lock.
   - Application Lambdas are created/updated, waiting on migrations.
4. Monitoring/alarms auto-provisioned.

---

# Appendix A — Sample CDK Code

> These snippets assume **PostgreSQL (Aurora)**. 

## A1. `infra/lib/db-stack.ts` — VPC, RDS, Secret

```ts
import { Stack, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class DbStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbSecret: secrets.Secret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, "Vpc", { natGateways: 1 });

    this.dbSecret = new secrets.Secret(this, "DbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "appuser" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    });

    this.cluster = new rds.DatabaseCluster(this, "Db", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      instanceProps: { vpc: this.vpc, publiclyAccessible: false },
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: "app",
    });
    this.cluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    new CfnOutput(this, "DbEndpoint", { value: this.cluster.clusterEndpoint.socketAddress });
  }
}
```

## A2. `infra/lib/api-stack.ts` — App Lambdas + Migrator + Custom Resource

```ts
import { Stack, Duration, CustomResource, aws_lambda as lambda } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as path from "path";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface Props {
  vpc: ec2.IVpc;
  cluster: rds.IDatabaseCluster;
  dbSecret: secrets.ISecret;
}

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const baseEnv = {
      DB_SECRET_ARN: props.dbSecret.secretArn,
      DB_HOST: props.cluster.clusterEndpoint.hostname,
      DB_PORT: props.cluster.clusterEndpoint.port.toString(),
      DB_NAME: "app",
    };

    const bundling = { minify: true, target: "node20", format: "esm" as const };

    // Example app Lambdas
    const usersFn = new NodejsFunction(this, "UsersFn", {
      entry: path.join(__dirname, "../../services/users/handler.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.vpc,
      bundling,
      environment: baseEnv,
    });
    props.dbSecret.grantRead(usersFn);
    props.cluster.connections.allowDefaultPortFrom(usersFn);

    const ordersFn = new NodejsFunction(this, "OrdersFn", {
      entry: path.join(__dirname, "../../services/orders/handler.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.vpc,
      bundling,
      environment: baseEnv,
    });
    props.dbSecret.grantRead(ordersFn);
    props.cluster.connections.allowDefaultPortFrom(ordersFn);

    // Migrator Lambda bundles all service migration files into /var/task/migrations
    const migrateFn = new NodejsFunction(this, "MigrateFn", {
      entry: path.join(__dirname, "../../infra/migrator/handler.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.vpc,
      timeout: Duration.minutes(5),
      environment: baseEnv,
      bundling: {
        ...bundling,
        commandHooks: {
          beforeBundling: (inputDir, outputDir) => [
            `mkdir -p ${outputDir}/migrations`,
            `shopt -s nullglob && for d in ${inputDir}/../../services/*/migrations; do cp -a "$d/." ${outputDir}/migrations/; done`,
          ],
          afterBundling: () => [],
          beforeInstall: () => [],
        },
      },
    });
    props.dbSecret.grantRead(migrateFn);
    props.cluster.connections.allowDefaultPortFrom(migrateFn);

    // Provider & Custom Resource
    const provider = new cr.Provider(this, "MigrationProvider", {
      onEventHandler: migrateFn,
    });

    // Bump to force re-run when migrations change
    const MIGRATIONS_VERSION = "v1.0.0";

    const runMigrations = new CustomResource(this, "RunMigrations", {
      serviceToken: provider.serviceToken,
      properties: { version: MIGRATIONS_VERSION },
    });

    // Ensure schema lands before new code is live
    usersFn.node.addDependency(runMigrations);
    ordersFn.node.addDependency(runMigrations);
  }
}
```

## A3. `infra/bin/app.ts` — Wiring Stacks

```ts
#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { DbStack } from "../lib/db-stack";
import { ApiStack } from "../lib/api-stack";

const app = new App();

const db = new DbStack(app, "DbStack");
new ApiStack(app, "ApiStack", {
  vpc: db.vpc,
  cluster: db.cluster,
  dbSecret: db.dbSecret,
});
```

---

# Appendix B — Migrator Lambda Handler (PostgreSQL)

Place at `infra/migrator/handler.ts`.

```ts
import type { OnEventRequest, OnEventResponse } from "aws-cdk-lib/custom-resources";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

async function connectionString() {
  const sm = new SecretsManagerClient({});
  const sec = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! }));
  const { username, password } = JSON.parse(sec.SecretString!);
  return `postgres://${username}:${encodeURIComponent(password)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
}

async function run() {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: await connectionString() });
  await client.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations(
        id serial primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      );
    `);
    // advisory lock to serialize migration execution
    await client.query("select pg_advisory_lock($1)", [424242]);

    const applied = new Set<string>(
      (await client.query("select name from schema_migrations")).rows.map(r => r.name)
    );

    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations(name) values ($1)", [f]);
        await client.query("commit");
        console.log("Applied", f);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [424242]).catch(() => {});
    await client.end();
  }
}

export const handler = async (evt: OnEventRequest): Promise<OnEventResponse> => {
  if (evt.RequestType === "Delete") return { PhysicalResourceId: "migrator" };
  await run();
  return { PhysicalResourceId: "migrator" };
};
```

> **MySQL variant**: replace advisory lock with `SELECT GET_LOCK('schema_migrations', 30)`, unlock with `SELECT RELEASE_LOCK('schema_migrations')`, and switch the client to `mysql2/promise`.

---

# Appendix C — Example Service Handler Using a Small Pool

```ts
// services/users/handler.ts
import { Pool } from "pg";

let pool: Pool | undefined;
function getPool() {
  return (pool ??= new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,        // optional if you fetch via secret once and cache
    password: process.env.DB_PASSWORD,// optional if you fetch via secret once and cache
    max: 3,
    idleTimeoutMillis: 30000,
    keepAlive: true,
  }));
}

export const handler = async () => {
  const p = getPool();
  const { rows } = await p.query("select now() as now");
  return { statusCode: 200, body: JSON.stringify(rows[0]) };
};
```

---

# Appendix D — Checklist (Pitfalls & Mitigations)

- **DB storms:** tiny pools, RDS Proxy, reserved concurrency.
- **Migration order/races:** global timestamp filenames, advisory lock, ledger, function dependency.
- **Long migrations:** keep in migrator small; heavy jobs via Fargate/Step Functions.
- **Cold starts:** esbuild bundles, Node 20, provisioned concurrency on hot paths.
- **Bundle size:** avoid native deps, use Layers if needed.
- **Secrets:** Secrets Manager, cache credentials.
- **Idempotency/retries:** tokens, DLQ, timeout tuning.
- **Backpressure:** reserved concurrency, source tuning.
- **Observability:** structured logs, alarms, X-Ray.
- **Payload limits:** presigned S3 URLs.
- **IAM scope:** least privilege per function.
- **Env drift:** CDK parameters/context per stage.
- **Rollback:** expand→deploy→contract; code waits for schema.
- **Coupling:** per-service ownership; optional per-service DB schemas.
- **Testing:** migrations & integration tests in CI; preview stacks.

