# Frontend Integration & E2E Roadmap

## Objectives
1. Ensure the web client is fully aligned with the new Lambda `/v1` backend APIs.
2. Prove the end-to-end UX flow (registration, login, dashboard, scan/upload, cards, search) via automated headless browser tests with screenshot artifacts.
3. Harmonize frontend E2E coverage with the existing API E2E harness so both share data seeds, assertions, and CI orchestration.

## Sequenced Task List

### 1. Baseline Integration (Complete)
- [x] Task 1.1 — Align API clients with `/v1` routes
  - [x] Action: Update all web service modules to use the new API helper.
  - [x] Verify: `pnpm --filter @namecard/web run build` succeeds and network calls target `/v1/*`.
- [x] Task 1.2 — Update shared tooling
  - [x] Action: Refresh `scripts/smoke-local.mjs` and constants to mirror the new paths.
  - [x] Verify: `pnpm run smoke:local` exercises `/v1` endpoints without manual edits.

### 2. Current Smoke Coverage (Complete)
- [x] Task 2.1 — Establish Puppeteer smoke runner
  - [x] Action: Create `tests/web-e2e` workspace with login → dashboard → cards flow and screenshots.
- [x] Verify: `pnpm run test:e2e:web` produces the registration/login/dashboard/scan/cards screenshots in `tests/web-e2e/artifacts/`.
- [x] Task 2.2 — Document & wire scripts
  - [x] Action: Hook the smoke runner into `test:e2e:web` while preserving the Cypress command under a new alias.
  - [x] Verify: Package scripts run without further configuration changes.

- [x] Task 3.1 — Registration via web UI
  - [x] Action: Script a Puppeteer step that navigates to `/auth/register`, submits a unique user (persist fixtures for reuse), and saves the confirmation screenshot.
  - [x] Verify: A follow-up UI redirect to `/auth/login` confirms the account exists and is ready for authentication.
- [x] Task 3.2 — Login via web UI
  - [x] Action: Continue the flow to `/auth/login`, authenticate using the user from Task 3.1, and capture the post-login dashboard view.
  - [x] Verify: Browser reaches `/` within 10 seconds with valid session tokens stored in localStorage.
- [x] Task 3.3 — Upload sample card image
  - [x] Action: Navigate to `/scan`, upload the bundled sample image, wait for processing status, and snapshot the confirmation UI.
  - [x] Verify: The UI reaches the success state (`Scan Another Card`) before proceeding, indicating ingestion succeeded.
- [x] Task 3.4 — Card list validation
  - [x] Action: Visit `/cards`, ensure the newly uploaded card appears (matching name/company from seed metadata), and capture the list view.
  - [x] Verify: Assert at least one card exists and the latest entry matches the upload from Task 3.3.
- [x] Task 3.5 — Card search smoke
  - [x] Action: Use the cards search UI to query for the uploaded card and stash the search-results screenshot.
  - [x] Verify: Search results contain the expected card and highlight key metadata (name/company/email).

### 4. Harmonize With API E2E Harness (Planned)
- [x] Task 4.1 — Share fixtures & seeding
  - [x] Action: Export API E2E seed utilities (`create_test_user.js`, card fixtures) into a shared helper consumed by both suites.
  - [x] Verify: Running `pnpm --filter @namecard/api-e2e run test:local` followed by `pnpm run test:e2e:web` reuses the same users/cards without duplicate seeding.
- [x] Task 4.2 — Common auth helpers
  - [x] Action: Wrap API session bootstrap in a shared module that Puppeteer can call when UI auth is unnecessary (e.g., background setup).
  - [x] Verify: When toggled, the web suite can obtain tokens in <2s and skip manual login for non-UX scenarios.
- [ ] Task 4.3 — Scenario parity
  - [ ] Action: Map API E2E scenarios (card CRUD, search, enrichment health) to equivalent UI interactions and assertions.
  - [ ] Verify: Pass/fail states match between API and web suites for the selected scenarios.
- [ ] Task 4.4 — Unified CI orchestration
  - [ ] Action: Update pipeline scripts/docs so API + web suites share setup/teardown steps (DB reset, seed) and run sequentially.
  - [ ] Verify: CI pipeline finishes both suites without manual intervention, emitting combined artifacts (logs + screenshots).
- [x] Task 4.5 — CI smoke stability
  - [x] Action: Reproduce smoke + quality gate jobs locally using GitHub Actions tooling (e.g., `act`) to mirror runner behaviour.
  - [x] Verify: `act pull_request --job web_e2e_smoke` succeeds without manual fixes.
  - Signed off: gpt-5-codex (2025-10-22)
- [x] Task 4.6 — Local CI bootstrap script
  - [x] Action: Add a helper script that provisions dependencies, boots postgres_test, and runs the smoke suite with CI flags.
  - [x] Verify: `pnpm run ci:smoke:local` (new script) completes end-to-end on a clean checkout.
- [ ] Task 4.7 — Sandbox bootstrap hardening
  - [ ] Action: Fortify `tests/web-e2e/src/smoke.ts` (port handling, /health waits, cleanup) and add targeted tests for runtime shim imports.
  - [ ] Verify: `pnpm --filter @namecard/web-e2e run test:smoke` and `pnpm --filter @namecard/shared run test` both pass after the changes.
- [ ] Task 4.8 — CI freeze & validation
  - [ ] Action: Land a dedicated “CI restore” commit that replays the full local pipeline before merging feature work.
  - [ ] Verify: A fresh `pnpm run ci:quality` succeeds locally and the subsequent GitHub run is green.
- [ ] Task 4.9 — Transitional safeguard
  - [ ] Action: Temporarily mark `web_e2e_smoke` as non-blocking while stabilising, then re-enable once stable.
  - [ ] Verify: Workflow YAML updated, smoke job rerun confirms desired gating behaviour.

### 5. Operational Follow-Ups (Planned)
- [ ] Task 5.1 — Capture artifacts in CI
  - [ ] Action: Archive Puppeteer screenshots and console logs as build artifacts.
  - [ ] Verify: CI job exposes downloadable evidence for each run.
- [ ] Task 5.2 — Health-check the stack prior to UI tests
  - [ ] Action: Add a pre-test hook that pings `/health` endpoints and aborts early on failure.
  - [ ] Verify: Failing health checks stop the web suite before browser launch.

## Quick Reference
- Full stack bootstrap: `pnpm run fullstack:up`
- Web smoke runner: `pnpm run test:e2e:web`
- API E2E harness: `pnpm --filter @namecard/api-e2e run test:local`
