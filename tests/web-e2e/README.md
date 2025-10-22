# Web E2E Smoke Tests

This workspace contains a lightweight Puppeteer smoke test that drives the production build of the NameCard frontend against the new Lambda-backed API surface. The suite can exercise the full UI registration/login journey or, when desired, bootstrap an authenticated session directly via the shared API helper to skip manual auth flows.

## What the test does
- Registers a brand-new user through the `/auth/register` UI and captures the success state (`01-registration-success.png`). (Skipped when running in bootstrap mode.)
- Signs in via the login form using the freshly created credentials (`02-login.png`). (Skipped when running in bootstrap mode.)
- Waits for the dashboard to render and captures a screenshot (`03-dashboard.png`).
- Visits the scan page, uploads the bundled sample card (`tests/fixtures/card-sample.jpg`), and captures the success state (`04-scan-success.png`).
- Navigates to the cards view, ensures data is visible, and captures a screenshot (`05-cards.png`).

Screenshots are written to `./artifacts` so you can review exactly which UI flows were exercised.

## Running locally
```bash
# Ensure the local stack (API + frontend) is running, e.g.
pnpm run fullstack:up

# In another terminal, execute the smoke test
pnpm run test:e2e:web
```

Environment overrides:
- `WEB_BASE_URL` – URL of the frontend (defaults to `http://localhost:8080`).
- `E2E_EMAIL` / `E2E_PASSWORD` – credentials, if you want the suite to reuse an existing account instead of creating a new one.
- `WEB_E2E_AUTH_MODE` – set to `bootstrap` (or `api`, `session`, `bypass`) to pre-seed auth tokens via the shared helper and skip the UI registration/login journey.
- `WEB_E2E_BYPASS_LOGIN` / `WEB_E2E_AUTH_BYPASS` – truthy flag equivalents for toggling bootstrap behaviour without changing the mode string.
- `WEB_E2E_API_BASE_URL` – API origin to use when bootstrapping auth (defaults to `http://localhost:3001`).

## Shared seed reuse

When you run the API harness (`pnpm --filter @namecard/api-e2e run test:local`) with seed sharing enabled, it writes the seeded user/card into `out/e2e-seed-state.json`. The Puppeteer smoke test will automatically read this file and skip the registration + upload steps, reusing the already-seeded data and asserting it is visible in the UI. In bootstrap mode, the suite also reuses these seed credentials when requesting tokens directly from the API.

To discard the shared seed and force a fresh UI flow, clear the state:

```bash
pnpm run e2e:seed:clear
```

The next API or web E2E run will reseed as needed.
```
