# Overhaul Task Plan

## Task 1 — Confirm Service Scope & Architecture
- [x] done — Produce an architecture brief that maps each domain (auth, cards, OCR/Textract, enrichment, uploads, search) to discrete Lambda-based services, documents shared utility strategy (extract vs duplicate), environment topology (dev/stage/prod, regional footprint, tenant isolation), and readiness checkpoints for production launch, alongside a signed shared schema/interface blueprint covering core data models and API/event contracts.

**Test Cases**
- [x] verified — Architecture brief reviewed and signed off by engineering + product stakeholders.
- [x] verified — Service boundary matrix cross-checked against the target flows in `OVERHAUL_PLAN.md` and the API inventory in `CLAUDE.md`.
- [x] verified — Shared schema/interface blueprint (ERDs, OpenAPI/AsyncAPI specs, integration patterns) approved and versioned in repo docs.

## Task 2 — Establish Monorepo Skeleton & Workspace Tooling (pnpm)
- [x] done — Restructure the repository into the `infra/` and `services/` layout, remove Turborepo configuration, and migrate to pnpm workspaces with temporary npm bridge scripts so linting, testing, and builds stay green during the transition, culminating in full removal of legacy tooling.

**Test Cases**
- [x] verified — `pnpm run lint:all` (workspace fan-out script) passes in the new layout.
- [x] verified — `pnpm run type-check:all` succeeds for all workspaces.
- [x] verified — `pnpm run test:all` executes (current API suite failures are functional, not workspace resolution issues).
- [x] verified — Turborepo artifacts removed and CI no longer references them.

## Task 3 — Implement Database Stack (CDK)
- [ ] done — Build `infra/lib/db-stack.ts` defining VPC, subnets, security groups, Amazon RDS PostgreSQL cluster, Secrets Manager secret, and exports required by dependent stacks, incorporating multi-AZ posture, automated backup/snapshot retention, connection caps, environment-specific sizing aligned to the topology from Task 1, and secret rotation strategy configurable per environment.

**Test Cases**
- [ ] verified — `npx cdk synth DbStack` runs cleanly with environment-specific context values.
- [ ] verified — Infrastructure unit tests/assertions cover engine version, backup policies, networking guardrails, and maximum connection thresholds (`pnpm run test --filter infra`).
- [ ] verified — Secrets rotation configuration validated via CDK assertions or snapshot.

## Task 4 — Implement API Stack & Lambda Packaging
- [ ] done — Create `infra/lib/api-stack.ts` (and supporting constructs) provisioning per-service Lambda functions, API Gateway routing, RDS Proxy, reserved concurrency, Secrets Manager access policies, and custom resource wiring, using esbuild bundling/Lambda Layers while codifying IAM least privilege, environment propagation, inter-service communication/auth patterns defined in the blueprint, and cold-start mitigation strategies.

**Test Cases**
- [ ] verified — `npx cdk synth ApiStack` succeeds and references DbStack outputs.
- [ ] verified — CDK integration test snapshots validate Lambda environment variables, permissions, and dependencies (`pnpm run test --filter infra`).
- [ ] verified — Performance harness (e.g., provisioned concurrency smoke) executed for critical endpoints before CI rollout.

## Task 5 — Build Schema Orchestrator Lambda
- [ ] done — Implement `infra/migrator/handler.ts` to manage schema versioning for the greenfield database with filesystem discovery, advisory locking, ledger management, replay prevention, alarm hooks, and pause/resume controls compatible with CI/CD deployments.

**Test Cases**
- [ ] verified — Unit tests cover migration ordering, ledger deduplication, and rollback-on-error paths (`pnpm run test --filter migrator`).
- [ ] verified — Local run against Dockerized Postgres (`pnpm run db:up && pnpm run migrate:local`) applies baseline migrations exactly once and surfaces failures via alarms/logs.

## Task 6 — Port Domain Services to Lambda Functions
- [ ] done — For each domain, implement TypeScript Lambda handlers under `services/<domain>/handler.ts`, sequence delivery (auth → cards → OCR/Textract → enrichment → uploads → search), refactor database schemas so each service owns its tables/namespace with secrets caching and pooled connections, and document cross-service contracts, synchronous/asynchronous interaction patterns, and transactional boundaries consistent with the shared blueprint.

**Test Cases**
- [ ] verified — Domain-specific unit tests execute via `pnpm run test -- --scope services` covering critical paths and cross-service isolation.
- [ ] verified — Contract/integration tests exercise representative API flows through the new API Gateway (`pnpm exec node test_phase2_api.js`, `pnpm exec node test_search_api.js`).
- [ ] verified — Regression E2E suite (`pnpm run test:e2e`) passes against the deployed stack with service boundaries and auth rules respected.

## Task 7 — Database Migration Authoring Workflow
- [ ] done — Establish per-service migration directories, timestamped filename templates, lint/CI guards for unsafe SQL, drift detection automation, and documentation on adding migrations, ensuring migrations bundle automatically with deployments and record metadata in `schema_migrations`.

**Test Cases**
- [ ] verified — Automated SQL linting/guards run in CI (`pnpm run lint:all` with migration plugin) and block disallowed patterns.
- [ ] verified — Drift detection (`pnpm run migrate:validate`) confirms advisory lock behavior and ledger updates.
- [ ] verified — Migration PR checklist adopted and enforced in repository docs.

## Task 8 — Observability, Reliability & Ops Guardrails
- [ ] done — Add shared logging utilities with structured JSON, tracing hooks (AWS X-Ray or equivalent), CloudWatch alarms (errors, throttles, latency, DB connections), DLQs, idempotency controls, curated dashboards (metrics, logs, traces), log retention policies, synthetic monitoring coverage, and an operational runbook detailing rollback procedures, failure playbooks, and chaos test cadence.

**Test Cases**
- [ ] verified — Infrastructure assertions confirm alarms, tracing resources, DLQ wiring, and dashboard/log retention definitions (`pnpm run test --filter infra-observability`).
- [ ] verified — Load/canary script (`pnpm exec node test_monitoring.js`) captures structured logs, validates alarm thresholds, and exercises synthetic probes in a staging environment.
- [ ] verified — Runbook reviewed during an operational readiness exercise with observability tooling sign-off.

## Task 9 — Developer Tooling & Local Experience
- [ ] done — Provide docker-compose updates (local Postgres + localstack if needed), seed scripts, sample env files, pnpm scripts for local Lambda emulation (SAM/Architect), and onboarding docs guaranteeing a parity local experience with automated smoke verification.

**Test Cases**
- [ ] verified — `pnpm run fullstack:up` boots the local stack and passes health checks.
- [ ] verified — Fresh-clone onboarding script completes without manual fixes.
- [ ] verified — Local smoke suite validates parity with deployed environment (fixtures, seed data, feature flags).

## Task 10 — CI/CD Pipeline & Launch Readiness
- [ ] done — Update pipelines to build/test packages, synth/deploy CDK stacks, run schema orchestrator, promote artifacts across environments, enforce cost/performance budgets, integrate monitoring/rollback hooks, and document the post-launch verification checklist for greenfield cutover.

**Test Cases**
- [ ] verified — CI pipeline dry-run succeeds on a feature branch (lint, test, synth, deploy --no-execute) using the pnpm scripts.
- [ ] verified — Staged deployment completes with monitoring sign-off, rollback checklist executed, and performance/cost dashboards reviewed.
- [ ] verified — Post-launch verification checklist completed during staging launch rehearsal.

## Task 11 — Security & Compliance Backbone
- [ ] done — Conduct threat modeling, define IAM baselines, implement automated policy linting, integrate secret rotation alerts, and document security response runbooks plus compliance evidence requirements (logs, audit trails, data handling).

**Test Cases**
- [ ] verified — Threat model reviewed and risks tracked to mitigation owners.
- [ ] verified — Automated IAM/static analysis checks wired into CI and passing.
- [ ] verified — Security runbook validated during tabletop exercise.

## Task 12 — Architecture Governance & Performance Benchmarks
- [ ] done — Establish architecture decision records (ADRs), dependency mapping, cost/performance baselines, and operational readiness review (ORR) gates to ensure services meet SLO/SLA targets and scalability expectations before launch.

**Test Cases**
- [ ] verified — ADR log populated for major decisions and reviewed at ORR.
- [ ] verified — Load/performance benchmarks captured with agreed success thresholds.
- [ ] verified — ORR sign-off completed with outstanding risks documented.
