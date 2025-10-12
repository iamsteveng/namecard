# Web E2E Smoke Tests

This workspace contains a lightweight Puppeteer smoke test that drives the production build of the NameCard frontend against the new Lambda-backed API surface.

## What the test does
- Registers a brand-new user through the `/auth/register` UI and captures the success state (`01-registration-success.png`).
- Signs in via the login form using the freshly created credentials (`02-login.png`).
- Waits for the dashboard to render and captures a screenshot (`03-dashboard.png`).
- Navigates to the cards view, ensures data is visible, and captures a screenshot (`04-cards.png`).

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
```
