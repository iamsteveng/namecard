# API E2E Coverage Gaps (Register → Search Flow)

## What Exists Today
- `test_phase2_api.js` and `test_search_api.js` target legacy Express endpoints via localhost and reuse demo credentials; Lambda mode shortcuts seed data and reuse cached access tokens.
- Cypress specs (`cypress/e2e/auth.cy.ts`, `cypress/e2e/cards.cy.ts`) validate login, profile fetch, basic card listing/stats/search using the pre-seeded demo workspace.
- No suite exercises the serverless handlers end-to-end with realistic Cognito auth; tests rely on dev bypass tokens or hard-coded JWTs.

## Critical Gaps
- **Registration & Sign-In**: No automated coverage for user self-registration, password policy validation, verification flows, or Cognito token exchange. All tests assume an existing demo user.
- **Image Scan Lifecycle**: Upload → Textract → enrichment/ocr callbacks is untested. No validation of S3 presigned upload, job submission, or background processing.
- **Card Creation & Retrieval**: Suites read existing fixtures; none asserts that a newly scanned card appears in `/v1/cards` or `/v1/cards/search` after asynchronous processing.
- **Search Accuracy**: Search specs run keyword queries against static data; they do not confirm that freshly indexed content becomes discoverable or that pagination/filters work on new records.
- **State Isolation & Cleanup**: Current scripts mutate shared demo data without teardown; repeated runs can drift results and hide regressions.
- **Multi-service Observability**: Missing assertions on side-effects (SQS/EventBridge messages, Textract status records, CloudWatch audit logs) that prove the workflow executed across services.
- **Error Paths & Resilience**: No coverage for retry scenarios, eventual consistency, or failure handling (e.g., Textract timeout, duplicate registration, malformed uploads).

## Next Steps
- Build a reusable API test harness that provisions throwaway Cognito users, uploads sample images via presigned URLs, polls for OCR completion, and confirms card discoverability end-to-end.
- Add deterministic cleanup (user deprovisioning, card deletion, S3 object removal) so the flow can run repeatedly in local and staging environments.
