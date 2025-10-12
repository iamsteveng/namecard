# Web E2E Smoke Tests

This workspace contains a lightweight Puppeteer smoke test that drives the production build of the NameCard frontend against the new Lambda-backed API surface.

## What the test does
- Loads the login page and captures a screenshot (`01-login.png`).
- Signs in using the seeded demo account (`demo@namecard.app` / `DemoPass123!`).
- Waits for the dashboard to render and captures a screenshot (`02-dashboard.png`).
- Navigates to the cards view, ensures data is visible, and captures a screenshot (`03-cards.png`).

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
- `E2E_EMAIL` / `E2E_PASSWORD` – credentials, if you want to test a different account.
```
