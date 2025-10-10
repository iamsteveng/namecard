# TASKS

## Objective 1 – Comprehensive API-level E2E coverage

1. Establish local baseline environment.
   - [x] Action: Pin pnpm (`corepack prepare pnpm@8.15.4 --activate`), install dependencies with `pnpm install --frozen-lockfile`, start local services via `pnpm run fullstack:up`.
   - [ ] Verification: `pnpm run lint:all && pnpm run type-check:all && pnpm run test:all` complete without error; `docker compose ps` shows required containers healthy.
2. Audit existing API integration tests and fixtures.
   - [ ] Action: Inspect `test_phase2_api.js`, `test_search_api.js`, Cypress specs, and shared utilities under `services/shared` to catalogue current coverage and data contracts.
   - [ ] Verification: Produce a short gap analysis note (`tests/api-e2e/GAPS.md`) summarising uncovered flows (register → search) committed to branch.
3. Define end-to-end test scenarios and data inputs.
   - [ ] Action: Draft scenario table (request payloads, expected responses, prerequisite state, clean-up strategy) in `tests/api-e2e/PLAN.md`; select sample card image (reuse existing fixture or add to `tests/fixtures/card-sample.jpg`).
   - [ ] Verification: Peer review or self-review sign-off noted in PLAN.md; image fixture loads locally (`file` command reports correct format) and repository size impact <200 KB.
4. Build reusable API test harness.
   - [ ] Action: Create a new pnpm workspace package (e.g., `@namecard/api-e2e`) with shared HTTP client, Cognito auth helper, S3/Textract stubs; configure environment variables via `.env.test` and add scripts `pnpm run test:api:e2e` and `pnpm run test:api:e2e:staging`.
   - [ ] Verification: `pnpm run test:api:e2e -- --help` (or dry-run flag) lists available scenarios; linting on the new package passes.
5. Implement flow tests locally against sandbox services.
   - [ ] Action: Write Jest (or Playwright API) specs covering: user registration, sign-in token exchange, image upload/scan trigger, card listing, search retrieval. Use LocalStack/Textract mocks to simulate OCR callback.
   - [ ] Verification: `pnpm run test:api:e2e` passes with all scenarios green; database tables reflect expected records (`docker compose exec postgres_test psql ... -c "select count(*) from cards"`).
6. Harden tests for deterministic re-runs.
   - [ ] Action: Add data seeding/cleanup hooks, retry logic for eventual consistency, and isolate resources per test run (namespaced user/email, S3 keys).
   - [ ] Verification: Consecutive executions of `pnpm run test:api:e2e` succeed without manual intervention and without residual rows (`count(*)` returns 0 after teardown).
7. Execute tests against staging AWS stack.
   - [ ] Action: Parameterise base URL and credentials; store staging secrets in GitHub/AWS SSM; run `pnpm run test:api:e2e:staging` from workstation (assumes VPN/AWS creds) targeting deployed API.
   - [ ] Verification: Command exits 0; confirm staging CloudWatch logs show exercised Lambdas; verify S3/Textract artefacts cleaned up.
8. Document operations + add runbook entry.
   - [ ] Action: Update `RUNBOOK.md` with “API E2E smoke” section describing invocation, environment variables, roll-back steps.
   - [ ] Verification: Markdown lint passes; reviewer acknowledges update during PR.

## Objective 2 – GitHub Action success with new coverage

1. Extend CI workflow to include API E2E job.
   - [ ] Action: Add new job (post-quality, pre-launch) in `.github/workflows/ci-cd.yml` spinning up required services (Postgres, LocalStack), running `pnpm run test:api:e2e`; ensure job artefacts (logs, screenshots) uploaded on failure.
   - [ ] Verification: `pnpm exec actionlint` passes; `pnpm run ci:quality` still green locally.
2. Provide staging execution toggle for workflows.
   - [ ] Action: Add boolean/choice input to workflow_dispatch for running staging tests; guard the new job to trigger on main/promotion only; configure AWS credentials + secrets references.
   - [ ] Verification: Manual `workflow_dispatch` dry-run (no promotion) shows staging job skipped/enabled according to input in GitHub UI.
3. Validate workflow locally before push.
   - [ ] Action: Use `act pull_request --job quality` and `act pull_request --job api_e2e` (with Docker-in-Docker) to ensure jobs succeed in simulated GitHub environment.
   - [ ] Verification: act completes without non-zero exit codes; inspect logs for service start-up timing issues.
4. Push feature branch and monitor GitHub Actions.
   - [ ] Action: Open PR; ensure `quality`, `api_e2e`, `infrastructure_dry_run`, `launch_readiness` jobs complete successfully.
   - [ ] Verification: Capture run URL + success screenshot in PR comments; annotate any flakes for follow-up.
5. Promote to staging and confirm AWS execution path.
   - [ ] Action: Trigger `workflow_dispatch` with `environment=staging`, `promote=true`; confirm new job runs against staging endpoints using stored secrets.
   - [ ] Verification: Workflow finishes green; AWS CloudWatch/SQS queues show expected traffic; update PR/issue with confirmation notes.
6. Establish ongoing monitoring + alerts.
   - [ ] Action: Configure GitHub branch protection requiring `api_e2e` job; add Slack/Teams webhook for failure notifications; optionally surface metrics in existing monitoring dashboards.
   - [ ] Verification: Branch protection rule visible in repository settings; send test notification to channel; document links in RUNBOOK.
