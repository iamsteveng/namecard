# Perplexity AI Integration Setup

## Overview
This document describes the setup and troubleshooting process for the Perplexity AI enrichment service in the NameCard application.

## Issue Resolution: Dummy API Key

### Problem
- Card enrichment was failing with `status: "failed"` and empty `companyData: {}`
- Processing time was ~355ms (quick failure, not timeout)
- Service health check reported as "enabled" and "configured"

### Root Cause
The `PERPLEXITY_API_KEY` stored in AWS Secrets Manager was a placeholder value: `"dummy-key-for-development"`

### Solution Applied

#### 1. Code Improvements
- Added `isDummyApiKey()` validation method to detect placeholder values
- Enhanced error logging with detailed context (API key validity, configuration status)
- Improved HTTP error handling with status codes and response details
- Updated `isEnabled()` and `hasValidConfig()` methods to validate real API keys

#### 2. API Key Setup Required
To enable Perplexity enrichment functionality:

1. **Obtain Valid API Key**:
   - Sign up at [Perplexity AI](https://www.perplexity.ai/)
   - Generate API key from the dashboard
   - Key should be ~40+ characters starting with real prefix

2. **Update AWS Secrets Manager**:
   ```bash
   AWS_PROFILE=namecard-staging aws secretsmanager update-secret \
     --secret-id namecard/api/staging \
     --secret-string '{"PERPLEXITY_API_KEY":"your_real_api_key_here",...}'
   ```

3. **Restart ECS Service** (via GitHub Actions):
   - Deploy through GitHub Actions to restart ECS tasks
   - New tasks will pick up the updated secret

#### 3. Validation
After updating the API key, test enrichment:
```bash
curl -X POST https://d30kjyihuszy50.cloudfront.net/api/v1/enrichment/card \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cardId": "test_card_id"}'
```

Expected successful response:
```json
{
  "success": true,
  "data": {
    "cardId": "...",
    "companyData": { /* enriched data */ },
    "status": "enriched",
    "sources": ["perplexity"],
    "confidence": 75,
    "processingTime": 2500,
    "enrichmentDate": "2025-08-24T..."
  }
}
```

## Enhanced Error Detection

The improved validation now detects:
- Missing API keys
- Dummy/placeholder patterns (`dummy`, `test`, `placeholder`, etc.)
- Short keys (< 20 characters)
- Development/staging placeholder values

## Logging Improvements

Enhanced error logs now include:
- API key configuration status
- Key validity (real vs dummy)
- HTTP status codes and response details
- Processing time and request context
- Full configuration state

## Monitoring

With improved logging, enrichment failures can be diagnosed through:
1. CloudWatch logs showing detailed error context
2. API responses indicating specific failure reasons
3. Health check endpoint showing configuration status

## Next Steps

1. **Get Real Perplexity API Key**: Replace dummy key with valid API key
2. **Deploy via Pipeline**: Use GitHub Actions for proper deployment
3. **Test Integration**: Validate enrichment works end-to-end
4. **Monitor Usage**: Set up alerts for API failures or rate limits