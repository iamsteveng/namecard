# NameCard Launch Checklist

## Pre-Deployment Verification
- [ ] Confirm `pnpm run ci:quality` passes locally and in CI.
- [ ] Validate migrations with `pnpm run migrate:validate` and review schema orchestrator plan output.
- [ ] Review observability dashboards and confirm synthetic monitor thresholds.
- [ ] Ensure rollback trigger decision matrix is updated and acknowledged by on-call.

## Deployment Execution
- [ ] Announce deployment window and establish war-room communication channel.
- [ ] Execute promotion workflow (`pnpm run ci:infra-dry-run` followed by pipeline promotion) with approvals recorded.
- [ ] Monitor CloudWatch dashboards for baseline Lambda errors, DLQ depth, and latency signals during deployment.
- [ ] Verify cost anomaly guardrails, budgets, and alarms are enabled for the selected environment.

## Post-Launch Verification
- [ ] Run synthetic monitor (`pnpm exec node test_monitoring.js`) and confirm all checks succeed.
- [ ] Validate API smoke tests (`pnpm run smoke:local` or corresponding environment smoke suite).
- [ ] Inspect CloudWatch dashboard for latency trend stabilization and confirm DLQ remains at zero.
- [ ] Check cost anomaly explorer and confirm no new events triggered post-deployment window.

## Rollback & Recovery Signals
- [ ] Document rollback trigger thresholds (error %, latency, cost anomaly) for the release.
- [ ] Confirm automated rollback command readiness, including schema orchestrator pause steps.
- [ ] Capture snapshots of critical dashboards pre/post launch to support recovery decisions.
- [ ] Record final deployment metadata via `pnpm run launch:record -- --environment=<env> --commit=<sha>`.
