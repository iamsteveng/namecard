#!/usr/bin/env bash
set -euo pipefail

# One‑shot handoff script to deploy Auth and Cards (staging) with 5‑min hard timeouts
# and run an end‑to‑end test (register/login → Cards list using ID token).
#
# Prereqs:
# - AWS CLI and Serverless Framework (local or via npx) available
# - AWS profile `namecard-staging` configured with access to ap-southeast-1
# - SSM/Secrets per SERVERLESS.md present for staging
# - Node.js 18+
#
# Optional environment overrides:
#   DEPLOY_TIMEOUT_SECONDS (default: 300)
#   AWS_PROFILE (default: namecard-staging)
#   AWS_REGION (default: ap-southeast-1)
#   AUTH_BASE / CARDS_BASE (if you want to skip auto-detection)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-300}"
export AWS_PROFILE="${AWS_PROFILE:-namecard-staging}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}"

echo "[handoff] Using profile=${AWS_PROFILE} region=${AWS_REGION} timeout=${DEPLOY_TIMEOUT_SECONDS}s"

echo "[handoff] Building shared package (services/shared)"
pushd "$ROOT_DIR/services/shared" >/dev/null
npm install --silent || true
npm run build
popd >/dev/null

echo "[handoff] Deploying Auth to staging with hard timeout"
pushd "$ROOT_DIR" >/dev/null
DEPLOY_TIMEOUT_SECONDS="$DEPLOY_TIMEOUT_SECONDS" bash scripts/deploy-auth-staging.sh
popd >/dev/null

echo "[handoff] Deploying Cards to staging with hard timeout"
pushd "$ROOT_DIR" >/dev/null
DEPLOY_TIMEOUT_SECONDS="$DEPLOY_TIMEOUT_SECONDS" bash scripts/deploy-cards-staging.sh
popd >/dev/null

derive_auth_base() {
  local out
  pushd "$ROOT_DIR/services/auth" >/dev/null
  if [ -x ./node_modules/.bin/serverless ]; then
    out=$(./node_modules/.bin/serverless info --stage staging --region "$AWS_REGION" --aws-profile "$AWS_PROFILE" || true)
  else
    out=$(npx -y serverless@3.40.0 info --stage staging --region "$AWS_REGION" --aws-profile "$AWS_PROFILE" || true)
  fi
  popd >/dev/null
  # Prefer the login endpoint as the base URL source
  echo "$out" | sed -n '1,200p' | awk '/POST - / && /\/login/ {print $3}' | sed 's/\r$//' | sed 's/\/login$//' | tail -n1
}

derive_cards_base() {
  local out
  pushd "$ROOT_DIR/services/cards" >/dev/null
  if [ -x ./node_modules/.bin/serverless ]; then
    out=$(./node_modules/.bin/serverless info --stage staging --region "$AWS_REGION" --aws-profile "$AWS_PROFILE" || true)
  else
    out=$(npx -y serverless@3.40.0 info --stage staging --region "$AWS_REGION" --aws-profile "$AWS_PROFILE" || true)
  fi
  popd >/dev/null
  # The list endpoint is the base path "" → look for GET with trailing /staging
  echo "$out" | sed -n '1,200p' | awk '/GET - https?:\/\// {print $3}' | sed 's/\r$//' | awk '/\/staging$/ {print $0}' | tail -n1
}

if [ -z "${AUTH_BASE:-}" ]; then
  AUTH_BASE="$(derive_auth_base || true)"
fi
if [ -z "${CARDS_BASE:-}" ]; then
  CARDS_BASE="$(derive_cards_base || true)"
fi

echo "[handoff] AUTH_BASE=${AUTH_BASE:-<unset>}"
echo "[handoff] CARDS_BASE=${CARDS_BASE:-<unset>}"

if [ -z "${AUTH_BASE:-}" ] || [ -z "${CARDS_BASE:-}" ]; then
  echo "[handoff] Could not auto-detect API bases. You can export AUTH_BASE and CARDS_BASE and re-run this script."
fi

echo "[handoff] Running end‑to‑end: register/login → Cards list"
AUTH_BASE="$AUTH_BASE" CARDS_BASE="$CARDS_BASE" node "$ROOT_DIR/scripts/test-cards-list.mjs" || true

echo "[handoff] If Cards returned 401, tail logs for auth debug:"
echo "  cd services/cards && ./node_modules/.bin/serverless logs -f list --stage staging --region $AWS_REGION --aws-profile $AWS_PROFILE -t"

echo "[handoff] Done."

