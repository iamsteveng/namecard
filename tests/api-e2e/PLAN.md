# API E2E Scenario Plan

## Environments & Tooling
- **Local (Docker stack)**: `pnpm run fullstack:up` to provision Postgres, Redis, LocalStack, and frontend sandbox. Test harness runs against http://localhost:4100 proxying Lambda sandbox events.
- **Staging (AWS)**: Requires VPN + AWS SSO credentials with permission to invoke API Gateway, Cognito, S3, Textract, EventBridge, and Secrets Manager.
- **Command entry point**: Consolidate under `pnpm run test:e2e` (aggregates `test:e2e:web` + upcoming `test:e2e:api`). API harness will live in `@namecard/api-e2e` package once implemented.

## Data Fixtures
- **Sample card image**: Add `tests/fixtures/card-sample.jpg` (≤200 KB, 300 DPI, contains multilingual content) sourced from anonymised demo asset. Reuse in both local and staging runs.
- **Seed personas**: Generate throwaway Cognito user/email per run (pattern: `e2e+<timestamp>@example.com`). Attach to unique tenant IDs so cleanup is isolated.
- **Mocked OCR payloads**: For local runs, pre-generate Textract JSON under `tests/fixtures/textract-basic.json` to simulate callback events.

## Scenario Matrix

| Scenario | Purpose | Key Steps | Expected Outcomes | Dependencies | Cleanup |
| --- | --- | --- | --- | --- | --- |
| `register-new-user` | Exercise public registration endpoint and Cognito integration. | POST `/v1/auth/register` with unique email → confirm verification stub → login via `/v1/auth/login`. | 201 on register; login returns access/refresh pair; profile reflects seeded defaults. | Cognito user pool (local mock/staging pool); email verification bypass toggle. | Delete Cognito user; remove tenant rows (`auth.users`, `cards.tenants`). |
| `upload-card-image` | Validate presigned upload and initial scan trigger. | Authenticated POST `/v1/uploads/cards` → PUT sample image to presigned URL → verify job enqueued via `/v1/cards/operations/<jobId>`. | 200 with upload URL; S3 object exists (local mock); job status `PENDING` with OCR job id. | S3 bucket (local mock/staging); EventBridge rule or SQS queue. | Delete S3 object; remove upload metadata rows. |
| `process-ocr-callback` | Ensure OCR → enrichment pipeline populates card record. | Simulate Textract callback (LocalStack invoke lambda or direct handler call) → wait for enrichment worker. | Card row created with OCR fields; status transitions to `READY`. | LocalStack Textract stub; enrichment lambda queue. | Purge queue messages; delete Textract artefacts. |
| `list-cards` | Confirm newly created card appears in list endpoint. | GET `/v1/cards` for auth user. | Response includes card with matching OCR data; pagination metadata accurate. | Previous scenarios to create card. | None beyond global cleanup. |
| `search-cards` | Validate search index updates with new card content. | GET `/v1/cards/search?q=<company>`; GET `/v1/search/cards?q=<name>`. | 200 responses containing card id; search meta shows hit count ≥1. | Search service indexer; eventual consistency window (poll with backoff). | Delete search index entries if API supports; otherwise wait for DB cleanup job. |
| `tear-down-user` | Ensure run leaves no residue. | Call admin teardown utility (API or direct SQL) after tests. | All rows for tenant removed; S3/Textract assets deleted; Cognito user gone. | Access to teardown endpoint or DB credentials. | n/a |

## Execution Flow
1. Bootstrap harness context (env vars, fixture paths, HTTP client, logging).
2. Run scenarios sequentially with timeout-aware polling for async operations.
3. Capture artefacts (request/response logs, Textract payloads) for GitHub Action uploads on failure.
4. Summarise run in JUnit + JSON to integrate with CI dashboards.

## Observability Hooks
- Emit structured logs per scenario step (service, requestId, duration).
- Capture CloudWatch log group pointers when running in staging.
- Measure timings for OCR completion to establish performance baseline.

## Risks & Mitigations
- **Eventual consistency**: Implement exponential backoff (max 2 minutes) when polling card/search endpoints.
- **Secrets drift**: Centralise configuration in `.env.test` mapped to SSM/Secrets Manager parameters; validate presence before execution.
- **LocalStack limits**: Provide fallback mocks when Textract simulation is unavailable.

## Action Items Before Implementation
- Wire `pnpm run test:e2e` to orchestrate both Cypress (web) and new API harness (once available).
- Add teardown helper script (Node CLI) to delete Cognito user + tenant footprint.
- Document environment requirements in `RUNBOOK.md` under "API E2E smoke" section.
