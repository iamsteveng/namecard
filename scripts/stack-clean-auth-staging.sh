#!/usr/bin/env bash
set -euo pipefail

# Force-clean the Serverless deployment bucket and delete the auth staging stack.
# Requires: awscli, jq; profile namecard-staging.

STACK_NAME=${1:-namecard-auth-staging-staging}
REGION=${2:-ap-southeast-1}
PROFILE=${3:-namecard-staging}

echo "Locating deployment bucket for stack: $STACK_NAME ($REGION)"
BUCKET=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  | jq -r '.StackResources[] | select(.LogicalResourceId=="ServerlessDeploymentBucket") | .PhysicalResourceId' || true)

if [ -z "${BUCKET:-}" ] || [ "$BUCKET" = "null" ]; then
  echo "Could not detect ServerlessDeploymentBucket from stack resources. Attempting describe-stack-events..."
  BUCKET=$(aws cloudformation describe-stack-events \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --profile "$PROFILE" \
    | jq -r '[.StackEvents[] | select(.LogicalResourceId=="ServerlessDeploymentBucket")][0].PhysicalResourceId' || true)
fi

if [ -z "${BUCKET:-}" ] || [ "$BUCKET" = "null" ]; then
  echo "Deployment bucket still not found. Exiting." >&2
  exit 1
fi

echo "Emptying S3 bucket: $BUCKET"
aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" --profile "$PROFILE" || true

echo "Deleting S3 bucket: $BUCKET"
aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION" --profile "$PROFILE" || true

echo "Deleting stack: $STACK_NAME"
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION" --profile "$PROFILE" || true
echo "Waiting for stack deletion to complete..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION" --profile "$PROFILE"
echo "Stack deletion completed."

