# Overhaul Task Plan

## Task 1 — Confirm Service Scope & Migration Sequencing
- [ ] done — Inventory the existing Express/API services, background workers, data flows, and shared packages to map them onto the target Lambda-based service boundaries outlined in `OVERHAUL_PLAN.md`, producing a migration sequencing brief that addresses auth, card processing, OCR, enrichment, uploads, and search flows.

**Test Cases**
- [ ] verified — Migration sequencing brief reviewed and signed off by engineering + product stakeholders.
- [ ] verified — Service boundary matrix cross-checked against current production endpoints (see `CLAUDE.md` API list).

## Task 2 — Establish Monorepo Skeleton & Workspace Tooling (pnpm)
- [ ] done — Restructure the repository into the `infra/` and `services/` layout, remove Turborepo configuration, and migrate to pnpm workspaces with shared scripts (or complementary lightweight runners) for linting, testing, and builds while keeping existing packages functional during the transition.

**Test Cases**
- [ ] verified — `pnpm run lint:all` (workspace fan-out script) passes in the new layout.
- [ ] verified — `pnpm run type-check:all` succeeds for all workspaces.
- [ ] verified — `pnpm run test:all` executes without workspace resolution failures.

## Task 3 — Implement Database Stack (CDK)
- [ ] done — Build `infra/lib/db-stack.ts` defining VPC, subnets, security groups, Amazon RDS PostgreSQL cluster, Secrets Manager secret, and outputs/exports required by dependent stacks, incorporating capacity sizing and parameterization for multiple environments.

**Test Cases**
- [ ] verified — `npx cdk synth DbStack` runs cleanly with environment-specific context values.
- [ ] verified — Infrastructure unit tests/assertions cover RDS configuration (engine version, backup settings, networking) via `pnpm run test --filter infra`.

## Task 4 — Implement API Stack & Lambda Packaging
- [ ] done — Create `infra/lib/api-stack.ts` (and supporting constructs) provisioning the per-service Lambda functions, API Gateway (or ALB) routing, RDS Proxy, reserved concurrency, Secrets Manager access policies, and the custom resource/migrator wiring described in the plan, using esbuild bundling and Lambda Layers where required.

**Test Cases**
- [ ] verified — `npx cdk synth ApiStack` succeeds and references the DbStack outputs.
- [ ] verified — CDK integration test snapshots validate Lambda environment variables, permissions, and dependencies (`pnpm run test --filter infra`).

## Task 5 — Build Central Migrator Lambda
- [ ] done — Implement `infra/migrator/handler.ts` with filesystem discovery, advisory locking, schema ledger management, and failure handling per Appendix B, packaging migrations during synth/deploy and exposing env configuration through the custom resource contract.

**Test Cases**
- [ ] verified — Unit tests cover migration ordering, ledger deduplication, and rollback-on-error paths (`pnpm run test --filter migrator`).
- [ ] verified — Local integration run against Dockerized Postgres (`pnpm run db:up && pnpm run migrate:local`) applies sample migrations exactly once.

## Task 6 — Port Domain Services to Lambda Functions
- [ ] done — For each domain (auth, cards, OCR/Textract, enrichment, uploads, search), implement TypeScript Lambda handlers under `services/<domain>/handler.ts`, enforce clear service boundaries by extracting or duplicating shared utilities where necessary, and refactor database schemas so each Lambda owns its tables (per-service schema or prefix) with secrets caching and pooled connections as described in the plan.

**Test Cases**
- [ ] verified — Domain-specific unit tests execute via `pnpm run test -- --scope services` covering critical paths and cross-service isolation.
- [ ] verified — Contract/integration tests exercise representative API flows through the new API Gateway (`pnpm exec node test_phase2_api.js`, `pnpm exec node test_search_api.js`).
- [ ] verified — Regression E2E suite (`pnpm run test:e2e`) passes against the deployed stack with service boundaries respected.

## Task 7 — Database Migration Authoring Workflow
- [ ] done — Establish per-service migration directories, timestamped filename templates, lint/CI guards for unsafe SQL, and developer documentation on adding migrations, ensuring migrations bundle automatically with deployments and record metadata in `schema_migrations`.

**Test Cases**
- [ ] verified — Automated SQL linting/guards run in CI (`pnpm run lint:all` with migration plugin) and block disallowed patterns.
- [ ] verified — Sample forward + rollback simulation (`pnpm run migrate:validate`) confirms advisory lock behavior and ledger updates.

## Task 8 — Observability, Reliability & Ops Guardrails
- [ ] done — Add shared logging utilities, structured JSON output, X-Ray tracing hooks, CloudWatch alarms (errors, throttles, latency, DB connections), DLQ destinations, idempotency tokens, and documentation covering operational runbooks and rollback procedure.

**Test Cases**
- [ ] verified — Infrastructure assertions confirm alarms and tracing resources (`pnpm run test --filter infra-observability`).
- [ ] verified — Load test or canary script (`pnpm exec node test_monitoring.js`) captures structured logs and validates alarm thresholds in a staging environment.

## Task 9 — Developer Tooling & Local Experience
- [ ] done — Provide docker-compose updates (local Postgres + localstack if needed), seed scripts, sample env files, pnpm scripts for local Lambda emulation (SAM/Architect), and onboarding documentation so contributors can run services locally in both serverless emulation and integration modes.

**Test Cases**
- [ ] verified — `pnpm run fullstack:up` boots the local stack and passes health checks.
- [ ] verified — Developer quickstart guide walk-through validated by a fresh environment smoke test (new clone setup script completes without manual fixes).

## Task 10 — CI/CD Pipeline & Cutover
- [ ] done — Update GitHub Actions (or alternative) workflows to build/test packages, synth/deploy CDK stacks, run pre-deploy migrations, promote artifacts across environments, and orchestrate data migration + final cutover/decommission of the legacy ECS stack with backout steps documented, using the new pnpm-based scripts.

**Test Cases**
- [ ] verified — CI pipeline dry-run succeeds on a feature branch (lint, test, synth, deploy --no-execute) using the pnpm scripts.
- [ ] verified — Staged deployment followed by production cutover completes with monitoring sign-off and rollback checklist executed.
