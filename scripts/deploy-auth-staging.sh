#!/usr/bin/env bash
set -euo pipefail

# Deploy Auth service (serverless-esbuild) to staging
# Prereqs: AWS credentials configured, Cognito Pool/Client IDs valid,
# Secrets Manager entries exist: namecard/database/staging, namecard/api/staging

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${STAGE:-staging}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
AWS_PROFILE="${AWS_PROFILE:-namecard-staging}"

echo "Building shared package (services/shared)..."
pushd "$ROOT_DIR/services/shared" >/dev/null
npm install --silent || true
npm run build
popd >/dev/null

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
    echo "Tip: aws cloudformation describe-stack-events --stack-name namecard-auth-${STAGE}-${STAGE} --region ${AWS_REGION} --profile ${AWS_PROFILE}"
    exit 124
  fi
  return $rc
}

TIMEOUT_SECONDS=${DEPLOY_TIMEOUT_SECONDS:-300}

echo "Deploying Auth service to ${STAGE} (serverless-esbuild)..."
pushd "$ROOT_DIR/services/auth" >/dev/null
npm install --silent || true
# Ensure Prisma client is generated for Lambda runtime
npx prisma generate --schema ../../packages/api/prisma/schema.prisma || true
# Copy generated Prisma client and engines into this service package
mkdir -p node_modules/@prisma || true
if [ -d ../../node_modules/@prisma/client ]; then
  rsync -a ../../node_modules/@prisma/client/ node_modules/@prisma/client/
fi
if [ -d ../../node_modules/.prisma ]; then
  rsync -a ../../node_modules/.prisma/ node_modules/.prisma/
fi
if [ -x ./node_modules/.bin/serverless ]; then
  SLS_CMD=(./node_modules/.bin/serverless)
else
  SLS_CMD=(npx -y serverless@3.40.0)
fi
run_with_timeout "$TIMEOUT_SECONDS" "${SLS_CMD[@]}" deploy --stage "$STAGE" --region "$AWS_REGION" --aws-profile "$AWS_PROFILE"
popd >/dev/null

echo "Done. Check the stack output for AuthApiUrl and try /health and /login."
