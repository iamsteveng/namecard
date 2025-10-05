#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[localstack] $1"
}

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

BUCKET_NAME=${S3_BUCKET_NAME:-namecard-local-bucket}

log "Ensuring S3 bucket ${BUCKET_NAME} exists"
awslocal s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null || awslocal s3 mb "s3://$BUCKET_NAME"

# LocalStack community edition does not emulate Cognito; emit predictable placeholders
pool_id=${COGNITO_USER_POOL_ID:-local-dev-pool}
client_id=${COGNITO_USER_POOL_CLIENT_ID:-local-dev-client}
client_secret=${COGNITO_USER_POOL_CLIENT_SECRET:-local-dev-secret}

cat <<JSON >/var/lib/localstack/bootstrap-outputs.json
{
  "bucket": "${BUCKET_NAME}",
  "cognitoUserPoolId": "${pool_id}",
  "cognitoClientId": "${client_id}",
  "cognitoClientSecret": "${client_secret}"
}
JSON

log "Bootstrap outputs written to /var/lib/localstack/bootstrap-outputs.json"
