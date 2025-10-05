# Task 1 — Architecture Brief & Shared Schema Blueprint

## Architecture Brief
Version: 1.0 (2025-09-25)  
Prepared by: Senior Developer (Codex CLI)

### Repository Structure for Overhaul
- **Monolith sunset** — `services/api/**` (Express + Prisma) and its `prisma/` directory are retired in this overhaul. Treat them as read-only references until the new services compile end-to-end; no fresh code lands there.
- **Service directories** — Create a top-level `services/` directory with one folder per bounded context: `services/auth`, `services/cards`, `services/ocr`, `services/enrichment`, `services/uploads`, `services/search`. Each folder must contain `handler.ts`, optional sub-handlers under `consumers/`, configuration (`config/`), helpers (`lib/`), tests (`tests/`), and SQL migrations (`migrations/`).
- **Deployable handlers** — API Gateway routes target `services/<domain>/handler.ts`. EventBridge and SQS consumers live alongside (e.g., `services/cards/consumers/card-updated.ts`). Remove legacy Express routing once the new handler is wired.
- **Migrations** — Per-service SQL resides in `services/<domain>/migrations/*.sql`. The central migrator Lambda walks these folders in lexicographical order; adopt the unified naming scheme `YYYYMMDDHHMM__<domain>__<description>.sql`.
- **Deletion sequencing** — When Cards and Auth pass integration tests on the new handlers, delete `services/api/` within the same change to block regressions. Bring the remaining services across by repeating the pattern: scaffold folder, port logic, add tests, hook events, then drop any straggling legacy code.

### Domain Mapping & Service Boundaries
- **Auth Service (`services/auth/handler.ts`)**
  - Responsibilities: Cognito user pool integration, JWT issuance/refresh, profile bootstrap, tenant-aware authorization policies.
  - Data Ownership: `auth.users`, `auth.identities`, `auth.refresh_tokens`, `auth.audit_logs` (logical Postgres schema); owns Cognito app clients & secrets in AWS Secrets Manager.
  - Sync Interfaces: `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/profile`.
  - Async Contracts: Emits `auth.user.created` when first-party accounts are provisioned; future roadmap includes a dedicated `auth.user.deactivated` event for downstream clean-up rather than consuming card-originated events. Both events remain roadmap-only until contracts are finalized.
  - Dependencies: AWS Cognito, SES (future), shared config/util packages, RDS Proxy connection with max pool 3.

- **Cards Service (`services/cards/handler.ts`)**
  - Responsibilities: CRUD for business cards, contact metadata, tag management, ownership enforcement, triggers OCR/enrichment workflows, manages scan ingestion, and exposes card analytics.
  - Data Ownership: `cards.cards`, `cards.card_tags`, `cards.card_activity`.
  - Sync Interfaces: `GET|POST /v1/cards`, `GET /v1/cards/{cardId}`, `PATCH /v1/cards/{cardId}`, `DELETE /v1/cards/{cardId}`, `POST /v1/cards/{cardId}/tag`, `POST /v1/cards/scan`, `GET /v1/cards/stats`.
  - Async Contracts: Emits `cards.card.captured` after image + metadata saved; consumes `ocr.ocr.completed` and `enrichment.card.completed` to update card state; future roadmap includes subscribing to `uploads.asset.created` once that event is introduced—today the service calls Uploads synchronously when resolving `uploadId` references; publishes `cards.card.updated` for search projections.
  - Dependencies: Uploads service presigned URLs, Auth claims, RDS Proxy, shared validation helpers.

- **OCR/Textract Service (`services/ocr/handler.ts`)**
  - Responsibilities: Manage Textract jobs, normalize OCR outputs, provide status APIs, enforce retry/backoff policies.
  - Data Ownership: `ocr.jobs`, `ocr.pages`, `ocr.raw_artifacts`, S3 staging bucket `namecard-ocr-artifacts-<env>` for intermediate files.
  - Sync Interfaces: `POST /v1/ocr/jobs` (submits card asset), `GET /v1/ocr/jobs/{jobId}` (polling/status).
  - Async Contracts: Consumes `cards.card.captured`; emits `ocr.ocr.completed` and `ocr.ocr.failed`; publishes enriched payload to EventBridge detail with normalized fields.
  - Dependencies: AWS Textract (asynchronous API), Step Functions express workflow for retries, shared `services/shared/textract` utilities.

- **Enrichment Service (`services/enrichment/handler.ts`)**
  - Responsibilities: External enrichment orchestration (Perplexity, Clearbit, etc.), company profile aggregation, deduplication, scoring.
  - Data Ownership: `enrichment.requests`, `enrichment.company_profiles`, `enrichment.company_enrichments`, `enrichment.card_enrichments`, `enrichment.news_articles`.
  - Sync Interfaces: `POST /v1/enrichment/cards/{cardId}`, `GET /v1/enrichment/cards/{cardId}`, `GET /v1/enrichment/company/{companyId}`.
  - Async Contracts: Consumes `ocr.ocr.completed` to auto-trigger, emits `enrichment.card.completed` / `enrichment.card.failed`; `enrichment.company.updated` is a roadmap event for future search cache warming.
  - Dependencies: Secrets for third-party APIs (Secrets Manager), throttling via SQS queue (`enrichment-requests-<env>`), shared http client libs.

- **Uploads Service (`services/uploads/handler.ts`)**
  - Responsibilities: Presigned URL issuance, upload policy enforcement (size, mime), lifecycle + virus scanning hooks (future), asset metadata ledger.
  - Data Ownership: `uploads.assets`, `uploads.upload_audit`, S3 customer bucket `namecard-uploads-<env>` with prefix isolation per tenant.
  - Sync Interfaces: `POST /v1/uploads/presign`, `POST /v1/uploads/complete`, `DELETE /v1/uploads/{assetId}`.
  - Async Contracts: Emits `uploads.asset.created` when upload completes (initially consumed by OCR to begin document processing; Cards will subscribe once event-driven asset hydration ships); `uploads.asset.expired` is scoped as a roadmap scheduled event to purge stale assets.
  - Dependencies: S3, CloudFront invalidation queue, shared security utilities for checksum verification.

- **Search Service (`services/search/handler.ts`)**
  - Responsibilities: Unified search API across cards and companies, query expansion, ranking, analytics logging.
  - Data Ownership: `search.documents`, `search.synonyms`, `search.query_logs`, `search.sync_state` (all Postgres-backed full-text search tables).
  - Sync Interfaces: `POST /v1/search/query`, `GET /v1/search/cards`, `GET /v1/search/companies`.
  - Async Contracts: Consumes `cards.card.updated`, `enrichment.company.updated` to refresh projections stored in Postgres FTS tables; emits `search.index.sync.failed` for ops alerting.
  - Dependencies: EventBridge bus feed, Postgres full-text search, observability helpers exported from `services/shared/runtime`. Future consideration: optional OpenSearch tier when query volume or relevance demands it.

> Alignment: Interfaces above align with the user flows in `OVERHAUL_PLAN.md` (card capture → OCR → enrichment → search) and the API inventory enumerated in `CLAUDE.md`.

### Shared Utility Strategy (Extract vs Duplicate)
- **`services/shared/runtime`** — Split the current `services/shared/src` into a new `runtime/` subpackage exposing logging, metrics, config loaders, error envelopes, HTTP client with retry/backoff, and Secrets Manager caching. Update workspace exports accordingly (`services/shared/runtime/src/index.ts`).
- **`services/shared/data`** — Stand up a sibling package housing database helpers (pg client factory, RDS Proxy config, migration runner). Move any existing data utilities from `services/shared` here during the overhaul.
- **`services/contracts`** — Create a new workspace package with `openapi/` and `events/` source folders plus `generated/` output. Add `pnpm run contracts:generate` to run the generator (`ts-node scripts/generate-contracts.ts`) and publish TypeScript clients consumed by each service.
- **Service-specific helpers** — Keep domain logic inside `services/<domain>/lib`. Duplication is acceptable for validators under ~20 lines to preserve boundaries.
- **Governance** — All shared packages adopt semver tagging via pnpm workspaces. Any change requires an ADR update, version bump, and explicit service opt-in through dependency updates.

### Environment Topology & Tenant Isolation
| Environment | AWS Account | Primary Region(s) | Database Tier | Notes |
|-------------|-------------|-------------------|---------------|-------|
| `dev`       | sandbox account (`namecard-dev`) | `ap-southeast-1` | Aurora PostgreSQL Serverless v2 (autoscale 0.5–4 ACUs) | Feature branches deploy via ephemeral stacks; single-tenant (internal) with synthetic data only. |
| `staging`   | shared pre-prod (`namecard-staging`) | `ap-southeast-1` (primary) + read replica in `ap-southeast-2` | Aurora PG Serverless v2 (1–8 ACUs) | Mirrors prod topology; fixtures seeded nightly; used for contract and load testing. |
| `prod`      | production account (`namecard-prod`) | `ap-southeast-1` (multi-AZ) + cross-region DR snapshot in `ap-southeast-2` | Aurora PG provisioned db.r6g.large (primary) + reader in second AZ | Customer data; provisioned concurrency & autoscaling alarms. |

Tenant strategy: single-tenant per account today; logical `tenant_id` column reserved in shared tables to unlock future multi-tenant support. S3 prefixes, EventBridge detail, and Lambda environment variables include tenant scoping. Cross-account IAM roles disallow lateral movement.

### Readiness Checkpoints Prior to Production Launch
1. **Service Readiness Reviews** — Architecture, code walkthrough, unit/integration coverage ≥85%, exception budget defined per domain.
2. **Operational Readiness Review (ORR)** — Runbooks, on-call rotation, alarm thresholds, synthetic checks validated in `staging`.
3. **Security & Compliance** — Threat model updated, IAM Access Analyzer clean, secrets rotation tested, PII handling documented.
4. **Data Readiness** — Migration dry-runs completed, rollback scripts rehearsed, seed data verified, tenant isolation smoke tests executed.
5. **Performance & Scalability** — Load tests for card ingest/search hit SLO (P95 < 400ms) with concurrency 200; cold-start mitigation validated.
6. **Deployment & Rollback** — Blue/green or canary plan reviewed, schema orchestrator pause/resume tested, dashboards bookmarked for launch war-room.
7. **Stakeholder Sign-off** — Product + Engineering sign off on the architecture brief, schema blueprint, and readiness evidence stored in repo (`docs/reviews/task1`).

## Shared Schema & Interface Blueprint
Blueprint Version: 1.0 (2025-09-25)

### Data Ownership Matrix (PostgreSQL)
| Domain | Logical Schema | Authoritative Tables | Key Notes |
|--------|----------------|----------------------|-----------|
| Auth | `auth` | `users`, `identities`, `refresh_tokens`, `audit_logs` | `users` retains Cognito IDs; `refresh_tokens` hashed; `audit_logs` append-only with JSON payload. |
| Cards | `cards` | `cards`, `card_tags`, `card_activity` | `cards` includes OCR/enrichment state columns; activity table captures lifecycle events for auditing. |
| OCR/Textract | `ocr` | `jobs`, `pages`, `raw_artifacts` | `jobs.status` enum (`queued|running|completed|failed`); stores Textract job IDs & S3 artifact references. |
| Enrichment | `enrichment` | `requests`, `company_profiles`, `company_enrichments`, `card_enrichments`, `news_articles` | `company_profiles` supersedes legacy `companies` table; dedupe by domain + normalized name. |
| Uploads | `uploads` | `assets`, `upload_audit`, `virus_scan_results` (future) | `assets` tracks presigned URL issuance + storage class; TTL enforced via scheduled job. |
| Search | `search` | `documents`, `synonyms`, `query_logs`, `sync_state` | `documents` stores Postgres tsvector columns with JSON payload for future external index; `sync_state` ensures idempotent projection updates. |
| Shared | `public` | `schema_migrations`, `service_versions` | `service_versions` logs deployed commit + migration hash per service for traceability. |

These entities supersede the legacy Prisma models in `services/api/prisma/schema.prisma`. As each service lands its SQL migrations the corresponding Prisma definitions are removed; the final cleanup step deletes the entire `services/api/prisma/` tree. Foreign keys cross schemas only via `tenant_id` and stable identifiers (`card_id`, `company_id`).

### Core API Contracts (REST via API Gateway `/v1`)
- **Auth**
  - `POST /v1/auth/login` — Request `{ email, password }`; Response `{ accessToken, refreshToken, expiresIn, user }`
  - `POST /v1/auth/refresh` — Request `{ refreshToken }`; Response `{ accessToken, expiresIn }`
  - `GET /v1/auth/profile` — Authenticated; returns `{ userId, email, name, roles, tenantId }`
  - `POST /v1/auth/logout` — Revokes refresh token; returns `{ success: true }`

- **Cards**
  - `GET /v1/cards` — Query params: `search`, `tag`, `page`, `pageSize`; returns paginated list with summary OCR/enrichment status.
  - `POST /v1/cards` — Request includes `{ uploadId, notes?, tags? }`; triggers `cards.card.captured` event.
  - `POST /v1/cards/scan` — Accepts `{ source, assetId?, image? }`; orchestrates immediate scan workflow for camera uploads.
  - `GET /v1/cards/{cardId}` — Returns full card + linked enrichment + timeline.
  - `PATCH /v1/cards/{cardId}` — Partial updates allowed on notes, tags, ownership.
  - `POST /v1/cards/{cardId}/tag` — Adds or removes tags (idempotent operations).
  - `GET /v1/cards/stats` — Returns aggregate metrics for recent captures, enrichment completion, and team usage.

- **OCR/Textract**
  - `POST /v1/ocr/jobs` — Request `{ cardId, assetId, force?: boolean }`; response `{ jobId, status, submittedAt }`.
  - `GET /v1/ocr/jobs/{jobId}` — Returns job status, progress, extracted text chunk summary.

- **Enrichment**
  - `POST /v1/enrichment/cards/{cardId}` — Manual trigger; body `{ providers?: string[], priority?: 'standard'|'rush' }`.
  - `GET /v1/enrichment/cards/{cardId}` — Aggregated enrichment payload including `companyProfiles`, `status`, `metrics`.
  - `GET /v1/enrichment/company/{companyId}` — Returns canonical company profile & news feed references.

- **Uploads**
  - `POST /v1/uploads/presign` — Request `{ mimeType, sizeBytes, purpose }`; response `{ uploadId, url, fields, expiresAt }`.
  - `POST /v1/uploads/complete` — Request `{ uploadId, checksum }`; response `{ assetId, objectKey }`.
  - `DELETE /v1/uploads/{assetId}` — Soft-delete asset & revoke tokens.

- **Search**
  - `POST /v1/search/query` — Request `{ query, filters?, pagination?, rankingProfile? }`; response includes aggregated cards + companies with highlights.
  - `GET /v1/search/cards` — Query param `q`; returns card matches.
  - `GET /v1/search/companies` — Query param `q`; returns company matches + enrichment score.

All APIs will be codified in OpenAPI 3.1 specs under `docs/contracts/openapi/*.yaml`, referenced by CI to guarantee forward compatibility. Auth endpoints require Cognito JWT; other services require `tenant_id` claim for scoping.

### Asynchronous Event Contracts (Amazon EventBridge Bus `namecard-core`)
| Event (detail-type) | Source | Detail Schema (JSON) | Producers | Consumers |
|---------------------|--------|----------------------|-----------|-----------|
| `cards.card.captured` | `com.namecard.cards` | `{ cardId, tenantId, userId, assetId, capturedAt }` | Cards Service | OCR, Enrichment (conditional), Search |
| `cards.card.updated` | `com.namecard.cards` | `{ cardId, tenantId, updatedFields[], updatedAt }` | Cards Service | Search |
| `ocr.ocr.completed` | `com.namecard.ocr` | `{ cardId, tenantId, jobId, text, confidence, fields[] }` | OCR Service | Cards, Enrichment, Search |
| `enrichment.card.completed` | `com.namecard.enrichment` | `{ cardId, tenantId, enrichmentId, score, companies[], rawDataRef }` | Enrichment Service | Cards, Search |
| `uploads.asset.created` | `com.namecard.uploads` | `{ assetId, tenantId, objectKey, checksum, expiresAt }` | Uploads Service | OCR (Cards will subscribe once event-driven asset hydration ships) |
| `search.index.sync.failed` | `com.namecard.search` | `{ scope, entityId, reason, retryAfter? }` | Search Service | Ops notifications (SNS), Observability stack |
| _Roadmap — `auth.user.created`_ | `com.namecard.auth` | `{ userId, tenantId, email, createdAt }` | Auth Service | Downstream services needing bootstrap |
| _Roadmap — `auth.user.deactivated`_ | `com.namecard.auth` | `{ userId, tenantId, deactivatedAt, reason? }` | Auth Service | Cards, Search, future services |
| _Roadmap — `enrichment.company.updated`_ | `com.namecard.enrichment` | `{ companyId, tenantId, enrichmentId, score, summary }` | Enrichment Service | Search |
| _Roadmap — `uploads.asset.expired`_ | `com.namecard.uploads` | `{ assetId, tenantId, expiredAt }` | Uploads Service | Cards, OCR |

Event payloads validated via JSON Schema (stored alongside OpenAPI specs). Changes require versioned detail-types (e.g., `*.v2`) to guarantee consumer compatibility.

### Shared Types, Validation & Governance
- Type definitions generated from OpenAPI/JSON Schema using `pnpm run contracts:generate`, producing TypeScript clients in `services/contracts/generated`.
- Zod validators accompany DTOs to ensure runtime validation inside Lambdas.
- Schema migrations versioned per service under `services/<domain>/migrations`. The migrator Lambda stitches them into deployment artifact; ledger table `public.schema_migrations` tracks applied files.
- ADR `docs/adr/0001-architecture-boundaries.md` (to be created) will capture these decisions. Subsequent changes must update ADR + bump blueprint version.

### Sign-Off
Approved by: Senior Developer (Codex CLI)  
Date: 2025-09-25  
Next action: Circulate to Product, Infrastructure, and Security leads for endorsement; store rendered PDF in `docs/reviews/task1/architecture-brief-v1.pdf` once signed.
