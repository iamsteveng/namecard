#!/usr/bin/env bash
set -euo pipefail

# Deploy Auth service without VPC to staging using profile namecard-staging

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

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
    echo "Deployment detected as stuck (timeout ${timeout}s)."
    echo "Tip: aws cloudformation describe-stack-events --stack-name namecard-auth-staging-staging --region ap-southeast-1 --profile namecard-staging"
    exit 124
  fi
  return $rc
}

TIMEOUT_SECONDS=${DEPLOY_TIMEOUT_SECONDS:-300}

echo "Building shared package (services/shared)..."
pushd "$ROOT_DIR/services/shared" >/dev/null
npm install --silent || true
npm run build
popd >/dev/null

echo "Deploying Auth (no VPC) to staging with profile namecard-staging..."
pushd "$ROOT_DIR/services/auth" >/dev/null
npm install --silent || true
run_with_timeout "$TIMEOUT_SECONDS" npx serverless deploy -c serverless-no-vpc.yml --stage staging --region ap-southeast-1 --aws-profile namecard-staging
popd >/dev/null

echo "Done. Test: /staging/health and confirm stack completes quickly."
