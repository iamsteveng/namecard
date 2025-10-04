# NameCard Serverless Platform

This repository houses the serverless rewrite of the NameCard business card scanning and enrichment application. Each bounded context (auth, cards, OCR, enrichment, uploads, search) runs as an AWS Lambda function behind HTTP API Gateway, sharing a Postgres database that is provisioned and migrated via CDK.

## Architecture at a Glance
- AWS API Gateway → Lambda handlers in `services/<domain>/handler.ts`
- Amazon RDS (PostgreSQL) accessed through RDS Proxy with per-service pools
- Amazon S3 for card images and Textract artefacts, fronted by CloudFront
- AWS Textract for OCR, EventBridge + SQS for background workflows
- AWS Cognito for user identity; secrets sourced from AWS Secrets Manager
- Infrastructure managed in the `infra/` workspace with AWS CDK (stacks for DB, API, Cognito, secrets, and supporting resources)

See `OVERHAUL_PLAN.md`, `OVERHAUL_TASKS.md`, and `OVERHAUL_OUTPUT.md` for the detailed architecture blueprint and delivery history.

## Repository Layout
- `services/auth|cards|search|ocr|enrichment|uploads|shared` – Lambda handlers, shared packages, and per-service SQL migrations
- `infra/` – CDK app defining VPC, database, API Gateway routing, Cognito, Secrets Manager, S3/CDN, and migration automation
- `scripts/` – Local utilities (`lambda-sandbox.mjs`, `smoke-local.mjs`, `check-migrations.cjs`, etc.)
- `docker-compose.yml` – Local dependencies (Postgres, Redis, LocalStack, optional frontend container)
- `DATABASE_MIGRATIONS.md` – Migrator workflow, naming rules, and guardrails
- `RUNBOOK.md` – Day-two operations, monitoring, and incident playbooks
- `launch/POST_LAUNCH_CHECKLIST.md` – Release readiness checklist

## Local Development
Prerequisites: Node.js 20+, pnpm 8+, Docker (for Postgres/Redis/LocalStack), and AWS credentials if you plan to hit real AWS accounts.

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Start data stores and LocalStack (for Textract/Cognito stubs):
   ```bash
   docker compose up -d postgres postgres_test redis localstack
   ```
3. Apply database migrations locally using the migrator Lambda runner:
   ```bash
   pnpm run migrate:local
   ```
4. Develop Lambda handlers with the sandbox (mirrors API Gateway events):
   ```bash
   pnpm run lambda:sandbox
   # In another terminal, invoke a handler
   curl -X POST http://localhost:4100/invoke/cards \
     -H 'Content-Type: application/json' \
     -d '{"event":{"version":"2.0","rawPath":"/cards","requestContext":{"http":{"method":"GET"}}}}'
   ```
5. Run the web client against the sandbox or deployed API:
   ```bash
   pnpm --filter @namecard/web run dev
   ```
6. Quality gates:
   ```bash
   pnpm run lint:all
   pnpm run type-check:all
   pnpm run test:all
   pnpm run migrate:validate   # ensures migrations stay in sync
   ```

Optional: build the production frontend image locally with `docker compose up -d frontend` once a backend endpoint is available at `VITE_API_URL`.

## Configuration & Secrets
- Populate `.env` from `.env.example` for local values (database URLs, AWS credentials, etc.).
- Runtime secrets live in AWS Secrets Manager (`namecard/api/<environment>`). Set keys such as `JWT_SECRET`, `PERPLEXITY_API_KEY`, and third-party tokens there; CDK wires them into Lambda environment variables (see `infra/lib/secrets-stack.ts` and `infra/lib/production-stack.ts`).
- The Perplexity enrichment service is disabled until a non-placeholder `PERPLEXITY_API_KEY` is stored in the secret. Update the secret and redeploy to enable it.

## Infrastructure & Deployment
All infrastructure code sits in the `@namecard/infra` workspace.

```bash
pnpm --filter @namecard/infra run build           # TypeScript → JS
pnpm --filter @namecard/infra run synth:staging    # Generate CloudFormation
pnpm --filter @namecard/infra run deploy:staging   # Deploy stacks (requires AWS perms)
```

The CDK app provisions the database, API Gateway + Lambda integrations, Cognito, Secrets Manager references, S3/CDN assets, and migration automation. Deployment pipelines should execute `pnpm run ci:quality`, `pnpm run migrate:validate`, and `pnpm run launch:verify` before promotion; refer to `RUNBOOK.md` for incident response and `launch/POST_LAUNCH_CHECKLIST.md` for release gates.

## Additional References
- `DATABASE_MIGRATIONS.md` – Detailed migrator instructions and guardrails
- `RUNBOOK.md` – Monitoring, on-call, and incident workflows
- `OVERHAUL_PLAN.md` / `OVERHAUL_TASKS.md` / `OVERHAUL_OUTPUT.md` – Architecture blueprint, task tracking, and historical notes
- `services/api/README.md` – Context on the retired Express monolith (kept for repository archaeology)

Keep documentation lean by updating this `README.md` whenever workflows change and prune any superseded notes alongside feature work.
