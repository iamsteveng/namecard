Here’s a concise plan to run the existing web smoke suite against the hosted site:

- [ ] Task 1 — **Action:** Confirm the target URLs respond before testing using `curl -I https://<web-host>` and `curl -I https://<api-host>/health`.
- [ ] Task 1 — **Verification:** Both commands return success (2xx) responses, showing the remote stack is reachable.
- [ ] Task 2 — **Action:** Export the remote endpoints so the runner skips local autostart by setting `WEB_BASE_URL`, `WEB_E2E_API_BASE_URL`, `WEB_E2E_SKIP_AUTOSTART=true`, and `WEB_E2E_SKIP_AUTOSTART_API_SANDBOX=true`.
- [ ] Task 2 — **Verification:** Environment variables are present when running `printenv` (or equivalent) and local services do not start during the run.
- [ ] Task 3 — **Action:** Decide on authentication: either allow a fresh registration or set `E2E_EMAIL`/`E2E_PASSWORD` (optionally `WEB_E2E_AUTH_MODE=bootstrap`) for a pre-provisioned account.
- [ ] Task 3 — **Verification:** The chosen credentials are valid—either the new account registers successfully or the provided account logs in without errors.
- [ ] Task 4 — **Action:** Execute the smoke suite from the repo root with `pnpm run test:e2e:web`.
- [ ] Task 4 — **Verification:** The command completes without failures and the console output shows each smoke step succeeded.
- [ ] Task 5 — **Action:** Review the generated screenshots in `tests/web-e2e/artifacts` to confirm the UI behaved as expected throughout the journey.
- [ ] Task 5 — **Verification:** Artifacts reflect the expected pages (registration/login/dashboard/scan/cards) and showcase the hosted environment state.
