# TASKS

## Objective 1 – Comprehensive API-level E2E coverage

1. Establish local baseline environment.
   - [x] Action: Pin pnpm (`corepack prepare pnpm@8.15.4 --activate`), install dependencies with `pnpm install --frozen-lockfile`, start local services via `pnpm run fullstack:up`.
   - [x] Verification: `pnpm run lint:all && pnpm run type-check:all && pnpm run test:all` complete without error; `docker compose ps` shows required containers healthy.
2. Audit existing API integration tests and fixtures.
   - [x] Action: Inspect `test_phase2_api.js`, `test_search_api.js`, Cypress specs, and shared utilities under `services/shared` to catalogue current coverage and data contracts.
   - [x] Verification: Produce a short gap analysis note (`tests/api-e2e/GAPS.md`) summarising uncovered flows (register → search) committed to branch.
3. Define end-to-end test scenarios and data inputs.
   - [x] Action: Draft scenario table (request payloads, expected responses, prerequisite state, clean-up strategy) in `tests/api-e2e/PLAN.md`; select sample card image (reuse existing fixture or add to `tests/fixtures/card-sample.jpg`).
   - [x] Verification: Peer review or self-review sign-off noted in PLAN.md; image fixture loads locally (`file` command reports correct format) and repository size impact <200 KB.
4. Build reusable API test harness.
   - [x] Action: Create a new pnpm workspace package (e.g., `@namecard/api-e2e`) with shared HTTP client, Cognito auth helper, S3/Textract stubs; configure environment variables via `.env.test` and add scripts `pnpm run test:api:e2e` and `pnpm run test:api:e2e:staging`.
   - [x] Verification: `pnpm run test:e2e:api -- --help` (dry-run enumerates scenarios) executes successfully; `pnpm run lint:all` includes the new package.
5. Implement flow tests locally against sandbox services.
   - [x] Action: Write Jest (or Playwright API) specs covering: user registration, sign-in token exchange, image upload/scan trigger, card listing, search retrieval. Prepare deterministic Cognito seed data and LocalStack/Textract stubs (queue events or callback mocks) before executing the suite.
   - [x] Verification: `pnpm run test:e2e:api:local` completes with targeted scenarios green; database tables reflect expected records (`docker compose exec postgres_test psql ... -c "select count(*) from cards"`) and mock queues/callbacks drain cleanly.
6. Harden tests for deterministic re-runs.
   - [x] Action: Add data seeding/cleanup hooks, retry logic for eventual consistency, and isolate resources per test run (namespaced user/email, S3 keys).
   - [x] Verification: `pnpm run test:e2e:api:local` can be executed repeatedly without manual intervention and teardown queries confirm zero residual rows in cards/uploads/OCR/auth tables.
7. Execute tests against staging AWS stack.
   - [x] Action: Parameterise base URL and credentials; provision required Cognito clients/SSM secrets and document VPN/AWS profile prerequisites; run `pnpm run test:api:e2e:staging` from a workstation with those credentials targeting the deployed API. (Used `API_E2E_BASE_URL_STAGING=https://frepw21wc8.execute-api.ap-southeast-1.amazonaws.com/staging`.)
   - [x] Verification: Command exits 0; confirm staging CloudWatch logs show exercised Lambdas (e.g. `AuthServiceFunction`, `CardsServiceFunction`); verify run artefacts cleaned up (card 63a6ac3d-ca3e-4444-bba4-0175d8f02306 deleted, no matching objects in `namecard-images-staging-145006476362`).
8. Document operations + add runbook entry.
   - [x] Action: Update `RUNBOOK.md` with “API E2E smoke” section describing invocation, environment variables, roll-back steps. (Added staging base URL discovery, log tailing, and cleanup guidance.)
   - [x] Verification: Markdown lint passes; reviewer acknowledges update during PR (confirmed).

## Objective 2 – GitHub Action success with new coverage

1. Extend CI workflow to include API E2E job.
   - [x] Action: Add new job (post-quality, pre-launch) in `.github/workflows/ci-cd.yml` spinning up Postgres, applying local migrations, running `pnpm run test:e2e:api:local`, and uploading logs on failure.
   - [x] Verification: `actionlint` v1.7.8 (downloaded binary) passes; `pnpm run ci:quality` still green locally (2025-10-11).
2. Provide staging execution toggle for workflows.
   - [x] Action: Add boolean workflow_dispatch input (`run_api_e2e_staging`) and conditional `api_e2e_staging` job that fans out only on main/release pushes or manual runs, wiring optional AWS creds and staging env vars.
   - [x] Verification: Manual `workflow_dispatch` dry-run toggling the flag shows the staging job skip/run behaviour as expected (confirmed by 2025-10-12 run).
3. Validate workflow logic before push.
   - [x] Action: Dry-run the updated workflow (e.g., `pnpm exec actionlint`, targeted script invocations) and, if Docker resources allow, optionally run `act pull_request --job quality` / `--job api_e2e` to catch orchestration issues early. (`actionlint` v1.7.8, `pnpm run ci:quality`, and manual workflow dispatch runs on 2025-10-11/12.)
   - [x] Verification: Local lint/dry-run checks completed without error; GitHub manual dispatch confirmed green runs (`run id 18437949462`).
4. Push feature branch and monitor GitHub Actions.
   - [x] Action: Open PR #31 ("Harden API E2E coverage and CI gating"); monitor `CI/CD & Launch Readiness` workflow for `quality`, `api_e2e`, `api_e2e (Staging)`, `infrastructure_dry_run`, `launch_readiness` jobs.
   - [x] Verification: Captured run https://github.com/iamsteveng/namecard/actions/runs/18438452507 in PR #31 comments; all jobs green, no flakes observed.
5. Promote to staging and confirm AWS execution path.
   - [x] Action: Triggered `workflow_dispatch` (`run 18438849024`) with `environment=staging`, `promote=true`, `run_api_e2e_staging=true`; staging API E2E job executed with configured secrets.
   - [ ] Verification: Promote job currently failing (`@namecard/infra` TypeScript build conflict between @smithy/types 4.6.0 vs 4.5.0). Need to resolve dependency mismatch before rerunning and validating CloudWatch/SQS traces.
