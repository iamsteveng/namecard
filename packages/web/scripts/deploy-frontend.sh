#!/bin/bash

# Exit on any error
set -e

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Default values
REGION="us-east-1"
S3_BUCKET=""
CLOUDFRONT_DISTRIBUTION_ID=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -b|--bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -d|--distribution-id)
            CLOUDFRONT_DISTRIBUTION_ID="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -r, --region REGION            AWS region (default: us-east-1)"
            echo "  -b, --bucket BUCKET            S3 bucket name (required)"
            echo "  -d, --distribution-id ID       CloudFront distribution ID (required)"
            echo "  -h, --help                     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Check if required parameters are provided
if [ -z "$S3_BUCKET" ] || [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo "Error: S3 bucket name and CloudFront distribution ID are required."
    echo "Use -h or --help for usage information."
    exit 1
fi

# Build the frontend
npm run build

# Deploy to S3
echo "Deploying frontend to S3 bucket: $S3_BUCKET"
aws s3 sync dist/ s3://$S3_BUCKET --delete --region $REGION

echo "Invalidating CloudFront distribution: $CLOUDFRONT_DISTRIBUTION_ID"
# Invalidate CloudFront
echo "Invalidating CloudFront distribution: $CLOUDFRONT_DISTRIBUTION_ID"
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*" --region $REGION

echo "Frontend deployment completed successfully!"
