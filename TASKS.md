# Frontend Integration & E2E Roadmap

## Objectives
1. Ensure the web client is fully aligned with the new Lambda `/v1` backend APIs.
2. Prove critical UX flows (registration, login, dashboard, cards) via automated headless browser tests with screenshot artifacts.
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
  - [x] Verify: `pnpm run test:e2e:web` produces `01-login.png`, `02-dashboard.png`, `03-cards.png` in `tests/web-e2e/artifacts/`.
- [x] Task 2.2 — Document & wire scripts
  - [x] Action: Hook the smoke runner into `test:e2e:web` while preserving the Cypress command under a new alias.
  - [x] Verify: Package scripts run without further configuration changes.

### 3. Extend UI Flow Coverage (In Progress)
- [ ] Task 3.1 — Registration via web UI
  - [ ] Action: Script a Puppeteer step that navigates to `/auth/register`, submits a unique user (persist fixtures for reuse), and saves the confirmation screenshot.
  - [ ] Verify: A follow-up API check or UI redirect confirms the account exists and is ready for login.
- [ ] Task 3.2 — Login via web UI
  - [ ] Action: Continue the flow to `/auth/login`, authenticate using the user from Task 3.1, and capture the post-login dashboard view.
  - [ ] Verify: Browser reaches `/` within 10 seconds with valid session tokens stored in localStorage.
- [ ] Task 3.3 — Upload sample card image
  - [ ] Action: Navigate to `/scan`, upload the seeded sample image, wait for processing status, and snapshot the confirmation UI.
  - [ ] Verify: API confirms a new card record for the current user and the UI reflects successful ingestion.
- [ ] Task 3.4 — Card list validation
  - [ ] Action: Visit `/cards`, ensure the newly uploaded card appears (matching name/company from seed metadata), and capture the list view.
  - [ ] Verify: Assert at least one card exists and the latest entry matches the upload from Task 3.3.
- [ ] Task 3.5 — Card search smoke
  - [ ] Action: Use the cards search UI to query for the uploaded card and stash the search-results screenshot.
  - [ ] Verify: Search results contain the expected card and highlight key metadata (name/company/email).

### 4. Harmonize With API E2E Harness (Planned)
- [ ] Task 4.1 — Share fixtures & seeding
  - [ ] Action: Export API E2E seed utilities (`create_test_user.js`, card fixtures) into a shared helper consumed by both suites.
  - [ ] Verify: Running `pnpm --filter @namecard/api-e2e run test:local` followed by `pnpm run test:e2e:web` reuses the same users/cards without duplicate seeding.
- [ ] Task 4.2 — Common auth helpers
  - [ ] Action: Wrap API session bootstrap in a shared module that Puppeteer can call when UI auth is unnecessary (e.g., background setup).
  - [ ] Verify: When toggled, the web suite can obtain tokens in <2s and skip manual login for non-UX scenarios.
- [ ] Task 4.3 — Scenario parity
  - [ ] Action: Map API E2E scenarios (card CRUD, search, enrichment health) to equivalent UI interactions and assertions.
  - [ ] Verify: Pass/fail states match between API and web suites for the selected scenarios.
- [ ] Task 4.4 — Unified CI orchestration
  - [ ] Action: Update pipeline scripts/docs so API + web suites share setup/teardown steps (DB reset, seed) and run sequentially.
  - [ ] Verify: CI pipeline finishes both suites without manual intervention, emitting combined artifacts (logs + screenshots).

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
