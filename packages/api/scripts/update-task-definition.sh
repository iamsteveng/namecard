#!/bin/bash

# Exit on any error
set -e

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Get the AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Check if we got an account ID
if [ -z "$ACCOUNT_ID" ]; then
    echo "Failed to get AWS account ID. Please ensure AWS CLI is configured."
    exit 1
fi

# Update the task definition file with the correct account ID
sed -i.bak "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" task-definition.json

# Remove the backup file
rm task-definition.json.bak

echo "Task definition updated with account ID: $ACCOUNT_ID"
