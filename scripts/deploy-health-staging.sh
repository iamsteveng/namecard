#!/usr/bin/env bash
set -euo pipefail

# Phase 3: Health-only deploy to staging for all microservices
# Requires AWS credentials and SSM params per SERVERLESS.md Phase 3 checklist.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES=(auth cards upload scan enrichment)

TIMEOUT_SECONDS=${DEPLOY_TIMEOUT_SECONDS:-300}

run_with_timeout() {
  local timeout="$1"; shift
  local timed_flag
  timed_flag="$(mktemp)"
  rm -f "$timed_flag"
  echo "Running with timeout ${timeout}s: $*"
  "$@" &
  local cmd_pid=$!
  (
    sleep "$timeout"
    if kill -0 "$cmd_pid" 2>/dev/null; then
      echo "Timeout reached (${timeout}s). Marking as stuck and terminating..."
      touch "$timed_flag"
      kill -TERM "$cmd_pid" 2>/dev/null || true
      sleep 5
      kill -KILL "$cmd_pid" 2>/dev/null || true
    fi
  ) &
  local timer_pid=$!
  wait "$cmd_pid" || true
  local rc=$?
  kill "$timer_pid" 2>/dev/null || true
  if [ -f "$timed_flag" ]; then
    rm -f "$timed_flag"
    echo "Deployment detected as stuck (timeout ${timeout}s). Service: ${svc}"
    exit 124
  fi
  return $rc
}

echo "Building shared package (services/shared)..."
pushd "$ROOT_DIR/services/shared" >/dev/null
npm install --silent || true
npm run build
popd >/dev/null

for svc in "${SERVICES[@]}"; do
  echo "---- ${svc}: packaging and deploying health endpoint to staging"
  pushd "$ROOT_DIR/services/${svc}" >/dev/null
  npm install --silent || true
  if [ "$svc" = "auth" ]; then
    echo "Skipping auth (already deployed via main pipeline)"
    popd >/dev/null
    continue
  fi
  if [ -f serverless-minimal.yml ]; then
    # Prefer local Serverless v3 if available to avoid v4 login requirement
    if [ -x ./node_modules/.bin/serverless ]; then
      SLS_CMD=./node_modules/.bin/serverless
    else
      SLS_CMD="npx -y serverless@3.40.0"
    fi

    run_with_timeout "$TIMEOUT_SECONDS" bash -lc "$SLS_CMD package -c serverless-minimal.yml --stage staging --region ap-southeast-1 --aws-profile namecard-staging"
    run_with_timeout "$TIMEOUT_SECONDS" bash -lc "$SLS_CMD deploy -c serverless-minimal.yml --stage staging --region ap-southeast-1 --aws-profile namecard-staging"
  else
    echo "serverless-minimal.yml not found for ${svc}; skipping"
  fi
  popd >/dev/null
done

echo "Done. Verify each service's /health endpoint in API Gateway logs/outputs."
