# AWS Cognito Setup - NameCard Application

## ✅ Deployment Summary

**Date**: July 30, 2025  
**Status**: Successfully Deployed  
**Method**: AWS CDK (Infrastructure as Code)

## 🔧 Cognito Configuration

### User Pool Details
- **User Pool ID**: `ap-southeast-1_b2Wqig5wn`
- **Client ID**: `115ri08uh384eqnf1k58qhle9f`
- **Region**: `ap-southeast-1`
- **User Pool ARN**: `arn:aws:cognito-idp:ap-southeast-1:025922408773:userpool/ap-southeast-1_b2Wqig5wn`
- **Domain URL**: `https://namecard-025922408773.auth.ap-southeast-1.amazoncognito.com`

### Features Configured
- ✅ **Email-based sign-in** (username not required)
- ✅ **Self-registration** enabled
- ✅ **Email verification** required
- ✅ **Password policy**: 8+ chars, uppercase, lowercase, numbers, symbols
- ✅ **MFA**: Disabled (can be enabled later)
- ✅ **Custom attributes**: company, jobTitle
- ✅ **OAuth flows**: Authorization code grant
- ✅ **Token validity**: 1h access, 1h ID, 30d refresh

## 🔐 Environment Variables

Add these to your `services/api/.env` file:

```env
# AWS Configuration
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-actual-access-key
AWS_SECRET_ACCESS_KEY=your-actual-secret-key

# AWS Cognito
COGNITO_USER_POOL_ID=ap-southeast-1_b2Wqig5wn
COGNITO_CLIENT_ID=115ri08uh384eqnf1k58qhle9f
COGNITO_REGION=ap-southeast-1

# JWT Secret (update with a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-this
```

## 🧪 Testing Your Setup

### 1. Test API Connection
```bash
# From your project root
cd services/api
pnpm run dev
```

### 2. Test Web Application
```bash
# From your project root  
cd services/web
pnpm run dev
```

### 3. Access Authentication Pages
- **Registration**: http://localhost:3000/auth/register
- **Login**: http://localhost:3000/auth/login
- **Forgot Password**: http://localhost:3000/auth/forgot-password

### 4. Test Registration Flow
1. Go to registration page
2. Enter email, name, and password (follow strength requirements)
3. Submit form
4. Check email for verification code
5. Verify account (if email verification is implemented)

## 🏗️ CDK Infrastructure

### Files Created
- `infra/lib/cognito-stack.ts` - Main Cognito stack definition
- `infra/bin/infrastructure.ts` - CDK app configuration

### CDK Commands
```bash
# Deploy updates
cdk deploy

# View changes before deploying
cdk diff

# Destroy resources (be careful!)
cdk destroy

# View synthesized CloudFormation
cdk synth
```

## 📋 Next Steps

1. **Update AWS Credentials**: Replace placeholder values with actual AWS credentials
2. **Update JWT Secret**: Generate a strong JWT secret (32+ characters)
3. **Test Authentication**: Start both API and web servers to test full flow
4. **Implement Email Verification**: Complete the email verification flow
5. **Add Error Handling**: Enhance error handling for various Cognito scenarios

## 🔍 Troubleshooting

### Common Issues
1. **Invalid credentials**: Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
2. **Region mismatch**: Ensure all regions are set to `ap-southeast-1`
3. **CORS errors**: Verify CORS_ORIGIN is set to `http://localhost:3000`
4. **Token errors**: Check JWT_SECRET is properly set

### Verification Commands
```bash
# Test AWS connection
aws sts get-caller-identity

# Test Cognito User Pool
aws cognito-idp describe-user-pool --user-pool-id ap-southeast-1_b2Wqig5wn

# Check API health
curl http://localhost:3001/health
```

## 🚀 Production Considerations

1. **Domain Setup**: Configure custom domain for production
2. **SSL Certificates**: Set up HTTPS for production domains
3. **Environment Variables**: Use AWS Systems Manager Parameter Store or Secrets Manager
4. **Monitoring**: Set up CloudWatch monitoring for Cognito metrics
5. **Backup**: Configure backup strategies for user data

---

**Stack Name**: `NameCardCognitoStack`  
**Account**: `025922408773`  
**Managed by**: AWS CDK
