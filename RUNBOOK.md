# NameCard Operations Runbook

This runbook captures the day-two operating procedures for the serverless NameCard platform. It focuses on observability, reliability, and rapid response playbooks introduced in Task 8.

## 1. Contact & Ownership
- **Primary on-call:** backend-lambdas@namecard.app (PagerDuty schedule: `namecard-backend`)
- **Secondary:** platform-observability@namecard.app
- **Escalation:** if no acknowledgement within 15 minutes, engage engineering management via Slack channel `#namecard-ops`

## 2. Monitoring Surface
- CloudWatch dashboard `namecard-<env>-observability` aggregates Lambda errors, duration p95, DLQ depth, API Gateway latency, Aurora and RDS Proxy connections.
- Lambda errors are mirrored to PagerDuty via SNS topics to ensure fast human acknowledgement.
- Synthetic checks run via `pnpm exec node test_monitoring.js` before deployments.
- Alarms configured:
  - `<Service>ErrorsAlarm`: Lambda error count ≥1 within 5 minutes.
  - `<Service>ThrottlesAlarm`: Lambda throttles detected.
  - `<Service>LatencyAlarm`: Lambda p95 latency exceeds 80% of configured timeout.
  - `HttpApiLatencyAlarm`: API Gateway latency breach beyond p95 budget.
  - `DbConnectionsAlarm`: Aurora connections above safe headroom.
  - `RdsProxyConnectionsAlarm`: Proxy saturation.
  - `LambdaDeadLetterQueueAlarm`: DLQ backlog > threshold.

## 3. Deployment Workflow
- **Primary pipeline:** GitHub Actions workflow `CI/CD & Launch Readiness` orchestrates quality checks, migration dry-run, launch verification, and promotion.
- **Pre-flight checks (local or in CI):**
  1. `pnpm run ci:quality` — runs lint, type-check, shared service tests, and builds. The job starts the `postgres_test` container automatically in CI.
  2. `DB_PORT=5433 DB_NAME=namecard_test pnpm run ci:infra-dry-run` — validates migrations against the ledger without applying changes.
  3. `pnpm run launch:verify` — asserts budgets, checklist headings, and monitoring guidance.
- **Promotion:** Trigger the workflow via `workflow_dispatch` (choose `dev` / `staging` / `prod`) or merge to `main`. The promote stage builds `@namecard/infra`, assumes the AWS deploy role, and runs `cdk deploy NameCardDb-<env> NameCardApi-<env> --require-approval never --context migrationsVersion=<commit>` so schema migrations execute before new Lambdas serve traffic.
- **Hotfix migrations:** If a targeted run is required, invoke `pnpm --filter @namecard/infra exec cdk deploy NameCardApi-<env> --context migrationsVersion=hotfix-<timestamp>` or call the `SchemaMigrator` Lambda with a manual payload. Keep migrations additive and follow up with drop scripts in later releases.
- **Rollback:** Re-run the workflow using the previous commit SHA in the promotion step. The migrator will skip already applied files (ledger-protected) and the custom resource keeps the old Lambda version until success.

## 4. Standard Response Workflow
1. **Acknowledge alarm** within 5 minutes.
2. **Check dashboard** for correlated anomalies (errors, latency, DLQ depth).
3. **Inspect structured logs** (CloudWatch Logs `namecard-<service>`). Use `requestId` emitted via `withHttpObservability` wrapper; DLQ payloads logged as JSON.
4. **Assess blast radius:**
   - For request failures, replay via API Gateway test harness.
   - For DLQ growth, sample payload using `aws sqs receive-message --queue <dlq>`.
5. **Mitigation options:**
   - Reprocess DLQ messages after fix with `scripts/replay-dlq.ts` (future work item).
   - Trigger rollback (`cdk deploy` previous version) if regression caused by latest release.
   - Scale up reserved/provisioned concurrency if sustained throttles.
6. **Comms:** Update incident Slack thread with status every 15 minutes; file post-incident summary within 24 hours.

## 5. Failure Playbooks
### 5.1 Lambda Error Spike
- Verify which Lambda triggered `<Service>ErrorsAlarm`.
- Check logs for `lambda.invocation.failed`. Capture `requestId` and `correlationIds`.
- For validation errors, confirm upstream contract changes; for dependency outages, enable feature flag fallback (`services/shared/data/config.ts`).

### 5.2 DLQ Backlog
- DLQ entries contain serialized JSON body and metadata (request/trace IDs).
- Download sample: `aws sqs receive-message --queue-url <dlq>`.
- If recoverable, replay via manual script; otherwise archive to S3 bucket `namecard-ops-dlq-archive` (future pipeline).

### 5.3 Database Connection Saturation
- `DbConnectionsAlarm` or `RdsProxyConnectionsAlarm` indicates saturation.
- Actions:
  1. Check CloudWatch Insights query `fields @timestamp, @message | filter message="lambda.invocation.failed" and data.errorName="DbConnectionError"`.
  2. Scale proxy max connections (CDK context) or reduce concurrency for offending service.
  3. Confirm Aurora is healthy via RDS console; failover if necessary.

### 5.4 Elevated API Latency
- Review `HttpApiLatencyAlarm` alongside Lambda duration alarms.
- Inspect `AccessLogSettings` entries for slow endpoints; confirm downstream dependencies (RDS, Textract, enrichment providers).
- Consider enabling fallback read replicas or degrading optional enrichment lookups.

## 6. Chaos & Validation Cadence
- **Monthly:** execute failure injection (simulate Textract outage, throttle RDS Proxy) and review alarm coverage.
- **Quarterly:** chaos test DLQ reprocessing and rollback procedure.
- **Per release:** run synthetic monitor (`pnpm exec node test_monitoring.js`) and targeted load script (TBD) before promotion.

## 7. Post-Incident Checklist
- Root cause documented in incident tracker (`Notion: Ops Incidents`).
- Update runbook if new mitigation discovered.
- Capture metrics impact (duration, customers affected, data at risk).
- Schedule retrospective within 3 business days for Sev1/Sev2 incidents.

## 8. Observability Ownership TODOs
- Automate DLQ drain script in CI.
- Integrate tracing export with AWS X-Ray service map.
- Wire alarms to PagerDuty via SNS subscription (pending Task 10).

Maintain this runbook alongside infrastructure code to ensure operational readiness remains versioned with deployments.
