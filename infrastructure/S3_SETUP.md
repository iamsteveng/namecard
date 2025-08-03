# NameCard S3 Infrastructure Setup with AWS CDK

This guide explains how to set up the S3 bucket and CloudFront CDN for the NameCard application using AWS CDK.

## 📋 Prerequisites

- AWS CLI installed and configured
- Node.js 18+ installed
- AWS CDK CLI installed: `npm install -g aws-cdk`
- AWS account with appropriate permissions

## 🏗️ Infrastructure Overview

The CDK stack creates:

- **S3 Bucket**: Secure storage for business card images
- **CloudFront CDN**: Global content delivery network
- **IAM Policies**: Proper access controls
- **Lifecycle Rules**: Cost optimization
- **CORS Configuration**: Web application support

## 📁 File Structure

```
infrastructure/
├── lib/
│   ├── s3-stack.ts           # S3 and CloudFront resources
│   └── infrastructure-stack.ts  # Main stack orchestration
├── bin/
│   └── infrastructure.ts     # CDK app entry point
├── scripts/
│   └── deploy.sh            # Deployment script
└── S3_SETUP.md             # This documentation
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd infrastructure
npm install
```

### 2. Configure AWS Credentials

```bash
# Option 1: Using AWS CLI
aws configure

# Option 2: Using environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

### 3. Bootstrap CDK (First time only)

```bash
npm run bootstrap
```

### 4. Deploy Infrastructure

```bash
# Development environment
./scripts/deploy.sh development

# Staging environment
./scripts/deploy.sh staging

# Production environment
./scripts/deploy.sh production
```

## 🔧 Manual Deployment

### Step-by-Step CDK Commands

```bash
# 1. Build the CDK app
npm run build

# 2. Synthesize CloudFormation template
npm run synth -- --context environment=development

# 3. Show what will be deployed
npm run diff -- --context environment=development

# 4. Deploy the stack
npm run deploy -- --context environment=development
```

### Environment-Specific Deployment

```bash
# Development
npm run deploy:dev

# Staging
npm run deploy:staging

# Production
npm run deploy:prod
```

## 🌍 Environment Configuration

### Development
- Bucket: `namecard-images-development-{account-id}`
- CORS: Allows localhost origins
- Lifecycle: Deletes bucket on stack deletion
- CloudFront: Price class 100 (North America & Europe)

### Staging
- Bucket: `namecard-images-staging-{account-id}`
- CORS: Allows staging domain
- Lifecycle: Retains bucket on stack deletion
- CloudFront: Price class 100

### Production
- Bucket: `namecard-images-production-{account-id}`
- CORS: Allows production domains only
- Lifecycle: Strong retention policies
- CloudFront: Price class ALL (global)
- Geographic restrictions: Major markets only

## 📊 Stack Outputs

After deployment, the stack provides these outputs:

```bash
# S3 Configuration
S3_BUCKET_NAME=namecard-images-{env}-{account}
S3_REGION=us-east-1
S3_CDN_DOMAIN=d1234567890123.cloudfront.net

# Infrastructure Details
BucketArn=arn:aws:s3:::namecard-images-{env}-{account}
CloudFrontDistributionId=E1234567890123
CDNUrl=https://d1234567890123.cloudfront.net
```

## 🔐 IAM Resources Created

### API Access Policy
- **Name**: `namecard-s3-api-access-{stack-name}`
- **Permissions**: 
  - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`
  - `s3:ListBucket`, `s3:GetBucketLocation`

### Service Role
- **Name**: `namecard-api-service-role-{stack-name}`
- **Assumed by**: EC2, ECS, Lambda services
- **Includes**: API access policy

## 📝 Environment Variables Setup

After deployment, update your API `.env` file:

```bash
# Copy the values from CloudFormation outputs
S3_BUCKET_NAME=namecard-images-development-123456789012
S3_REGION=us-east-1
S3_CDN_DOMAIN=d1234567890123.cloudfront.net

# AWS credentials (for local development)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

## 🗂️ S3 Folder Structure

The bucket organizes files automatically:

```
namecard-images-{env}-{account}/
├── images/
│   ├── users/
│   │   └── {userId}/
│   │       ├── storage/          # Original processed images
│   │       ├── ocr/             # OCR-optimized versions
│   │       ├── thumbnail/       # Small previews (300x300)
│   │       ├── avatar/          # Profile pictures (512x512)
│   │       └── web-display/     # Web-optimized (1920x1080)
│   └── public/                  # Public files
│       ├── storage/
│       ├── thumbnail/
│       └── web-display/
```

## 🔄 Lifecycle Management

### Transition Rules
- **30 days**: Move to Infrequent Access (IA)
- **90 days**: Move to Glacier
- **Versioning**: Old versions deleted after 30 days
- **Multipart**: Incomplete uploads deleted after 7 days

### Cost Optimization
- Versioning enabled for data protection
- Intelligent tiering for access patterns
- CloudFront caching reduces S3 requests

## 🌐 CloudFront Configuration

### Caching Behavior
- **Default TTL**: 1 day
- **Max TTL**: 1 year
- **Compression**: Enabled
- **HTTP/2 and HTTP/3**: Enabled

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: default-src 'self'`

### Geographic Restrictions
- **Development/Staging**: No restrictions
- **Production**: Restricted to major markets (US, CA, GB, DE, FR, AU, JP)

## 🧪 Testing the Infrastructure

### 1. Verify S3 Bucket

```bash
# List buckets
aws s3 ls | grep namecard-images

# Test bucket access
aws s3 ls s3://namecard-images-development-{account-id}/
```

### 2. Test CloudFront

```bash
# Get distribution info
aws cloudfront list-distributions --query 'DistributionList.Items[?Comment==`NameCard Images CDN - development`]'

# Test CDN endpoint
curl -I https://d1234567890123.cloudfront.net/
```

### 3. API Integration Test

```bash
# Test S3 health endpoint
curl http://localhost:3001/api/v1/s3/health

# Test configuration endpoint (requires JWT)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/v1/s3/config
```

## 🔍 Troubleshooting

### Common Issues

1. **CDK Bootstrap Error**
   ```bash
   # Re-bootstrap with explicit account/region
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

2. **Permissions Error**
   - Ensure AWS credentials have CloudFormation, S3, CloudFront, and IAM permissions
   - Check AWS profile configuration

3. **Stack Already Exists**
   ```bash
   # Check existing stacks
   aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
   
   # Update existing stack
   npm run deploy -- --context environment=development
   ```

4. **CloudFront Deployment Slow**
   - CloudFront distributions take 15-20 minutes to deploy
   - This is normal AWS behavior

### Debugging Commands

```bash
# Check CDK synthesis
npm run synth -- --context environment=development

# Validate CloudFormation template
aws cloudformation validate-template --template-body file://cdk.out/NameCardInfra-development.template.json

# Check stack events
aws cloudformation describe-stack-events --stack-name NameCardInfra-development
```

## 🧹 Cleanup

### Delete Stacks

```bash
# Delete development stack
npm run destroy -- --context environment=development

# Or use AWS CLI
aws cloudformation delete-stack --stack-name NameCardInfra-development
```

### Manual Cleanup (if needed)

```bash
# Empty S3 bucket before deletion (if bucket retention is enabled)
aws s3 rm s3://namecard-images-{env}-{account}/ --recursive

# Delete bucket
aws s3 rb s3://namecard-images-{env}-{account}/
```

## 💰 Cost Optimization

### Estimated Costs (per month)

**Development/Staging**:
- S3 storage: $1-5 (depending on usage)
- CloudFront: $1-10 (first 1TB free)
- **Total**: ~$2-15/month

**Production**:
- S3 storage: $5-25 (with lifecycle management)
- CloudFront: $10-50 (depending on traffic)
- **Total**: ~$15-75/month

### Cost Reduction Tips

1. **Enable S3 Intelligent Tiering**
2. **Use CloudFront effectively** (reduces S3 requests)
3. **Set up lifecycle rules** (automatic archival)
4. **Monitor with AWS Cost Explorer**
5. **Delete old versions** regularly

## 📈 Monitoring

### CloudWatch Metrics
- S3 bucket size and request counts
- CloudFront cache hit rates and error rates
- Cost and billing alerts

### Recommended Alarms
- High S3 costs (>$50/month)
- CloudFront high error rate (>5%)
- Unusual access patterns

## 🔒 Security Best Practices

1. **Bucket Policies**: No public access by default
2. **CloudFront OAI**: Secure S3 access only through CDN
3. **SSL/TLS**: HTTPS only for all connections
4. **IAM Roles**: Principle of least privilege
5. **Access Logging**: Enable for audit trails
6. **Versioning**: Protect against accidental deletion

## 📚 Additional Resources

- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/)
- [Amazon S3 User Guide](https://docs.aws.amazon.com/s3/)
- [Amazon CloudFront Developer Guide](https://docs.aws.amazon.com/cloudfront/)
- [AWS Cost Optimization Guide](https://aws.amazon.com/pricing/cost-optimization/)

---

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review AWS CloudFormation events in the console
3. Check CDK documentation for your specific version
4. Consult AWS support if needed

## 📞 Quick Commands Reference

```bash
# Deploy
./scripts/deploy.sh development

# Check status
aws cloudformation describe-stacks --stack-name NameCardInfra-development

# Get outputs
aws cloudformation describe-stacks --stack-name NameCardInfra-development --query 'Stacks[0].Outputs'

# Destroy
npm run destroy -- --context environment=development
```