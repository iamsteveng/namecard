#!/usr/bin/env bash
set -euo pipefail

# Deploy Cards service (serverless-webpack) to staging with profile namecard-staging

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
    echo "Deployment detected as stuck (timeout ${timeout}s)."
    echo "Tip: aws cloudformation describe-stack-events --stack-name namecard-cards-staging-staging --region ap-southeast-1 --profile namecard-staging"
    exit 124
  fi
  return $rc
}

echo "Building shared package (services/shared)..."
pushd "$ROOT_DIR/services/shared" >/dev/null
npm install --silent || true
npm run build
popd >/dev/null

echo "Preparing Prisma client for Cards..."
pushd "$ROOT_DIR" >/dev/null
npx prisma generate --schema packages/api/prisma/schema.prisma || true
popd >/dev/null

echo "Deploying Cards service to staging..."
pushd "$ROOT_DIR/services/cards" >/dev/null
npm install --silent || true
# Copy generated Prisma client and engines into this service package
mkdir -p node_modules/@prisma || true
if [ -d ../../node_modules/@prisma/client ]; then
  rsync -a ../../node_modules/@prisma/client/ node_modules/@prisma/client/
fi
if [ -d ../../node_modules/.prisma ]; then
  rsync -a ../../node_modules/.prisma/ node_modules/.prisma/
fi

# 5-minute hard timeout to detect stuck CloudFormation deploys (exit 124)
run_with_timeout "$TIMEOUT_SECONDS" ./node_modules/.bin/serverless deploy --stage staging --region ap-southeast-1 --aws-profile namecard-staging
popd >/dev/null

echo "Cards deploy complete. Use: ./node_modules/.bin/serverless info --stage staging"
