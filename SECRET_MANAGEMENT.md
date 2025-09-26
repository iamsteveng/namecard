# Secret Management System

This document describes the comprehensive secret management system for the NameCard application, including both automated workflows and manual tools for managing sensitive data across different environments.

## Overview

The secret management system provides:
- **Automated validation** of secrets through GitHub Actions
- **Health monitoring** and rotation capabilities  
- **Secure storage** using AWS Secrets Manager
- **Environment isolation** (staging, production)
- **Manual utilities** for local development and troubleshooting

## Architecture

### Components

1. **AWS Secrets Manager**: Centralized storage for application secrets
2. **GitHub Actions Workflows**: Automated secret management operations
3. **CDK SecretsStack**: Infrastructure-as-code for secret resources
4. **Local Utilities**: Command-line tools for manual operations

### Secret Structure

#### Database Secrets: `namecard/database/{environment}`
```json
{
  "host": "database-host.region.rds.amazonaws.com",
  "port": "5432",
  "dbname": "namecard_db",
  "username": "namecard_user", 
  "password": "secure-password"
}
```

#### API Secrets: `namecard/api/{environment}`
```json
{
  "JWT_SECRET": "base64-encoded-jwt-secret",
  "PERPLEXITY_API_KEY": "pplx-api-key",
  "CLEARBIT_API_KEY": "clearbit-api-key",
  "NEWS_API_KEY": "news-api-key"
}
```

## GitHub Actions Workflow

### Automatic Triggers

The secret management workflow automatically runs in these scenarios:

#### 1. **Infrastructure Changes** (Push/PR)
- **Files monitored**:
  - `infra/lib/secrets-stack.ts`
  - `infra/lib/production-stack.ts` 
  - `infra/config/**`
  - `.github/workflows/secret-management.yml`
  - `.github/workflows/deploy-staging.yml`
- **Actions**: Detects new secrets, validates configuration, auto-deploys on main branch

#### 2. **Scheduled Health Checks**
- **Schedule**: Daily at 2 AM UTC (`0 2 * * *`)
- **Actions**: Validates all secrets, checks for aging secrets (>90 days), generates health reports

#### 3. **Called by Other Workflows**  
- **Deploy staging workflow**: Calls secret validation before infra deployment
- **Deploy production workflow**: Validates secrets before production deployment
- **Custom workflows**: Can call using `workflow_call` trigger

#### 4. **New Secret Detection**
When new secrets are added to the infra:
1. **Detection**: CDK synthesis detects new `AWS::SecretsManager::Secret` resources
2. **Validation**: Checks if secrets already exist in AWS
3. **Deployment**: Automatically deploys new secrets if they don't exist
4. **Verification**: Validates deployed secrets are accessible and properly structured

#### 5. **Integration with Deployment Pipeline**
```yaml
# Example integration in deploy-staging.yml
- name: Validate and deploy secrets
  uses: ./.github/workflows/secret-management.yml
  with:
    environment: staging
    operation: validate-secrets
    deploy_new_secrets: true
```

### Manual Operations

Use the workflow dispatch feature to perform manual operations:

```bash
# Via GitHub web interface or GitHub CLI
gh workflow run secret-management.yml \
  -f operation=validate-secrets \
  -f environment=staging \
  -f dry_run=true
```

### Available Operations

1. **validate-secrets**: Comprehensive validation of all secrets
2. **health-check**: Monitor secret health and age
3. **update-secrets**: Deploy secret infra updates  
4. **rotate-api-keys**: Rotate JWT and API keys
5. **backup-secrets**: Backup secret metadata (not values)

### Workflow Jobs

#### 1. Secret Validation
- Verifies secret existence and accessibility
- Validates secret structure and required fields
- Tests connectivity to external services
- Runs on: PR, push, manual validation

#### 2. Health Check  
- Monitors secret age and usage patterns
- Checks for secrets older than 90 days
- Validates secret accessibility and structure
- Generates health reports

#### 3. Secret Updates
- Deploys infra changes to secrets
- Supports dry-run mode for testing
- Validates updates after deployment
- Environment-specific deployment

#### 4. API Key Rotation
- Rotates JWT secrets with zero downtime
- Generates new secure keys using OpenSSL
- Updates ECS services to use new secrets
- Maintains backward compatibility during transition

#### 5. Secret Backup
- Creates metadata backups (no secret values)
- Stores backup artifacts in GitHub
- Tracks secret creation and modification dates
- Useful for audit and compliance

## Local Management Tool

### Installation

The secret management utility is located at `scripts/secret-management.sh`:

```bash
# Make executable (if not already)
chmod +x scripts/secret-management.sh

# Add to PATH (optional)
export PATH="$PATH:$(pwd)/scripts"
```

### Basic Usage

```bash
# Validate all secrets for staging
./scripts/secret-management.sh validate staging

# Health check with verbose output
./scripts/secret-management.sh health-check production --verbose

# List all secrets for an environment
./scripts/secret-management.sh list staging

# Test connectivity
./scripts/secret-management.sh test-connectivity staging

# Rotate JWT secret (dry run)
./scripts/secret-management.sh rotate-jwt production --dry-run

# Backup secret metadata
./scripts/secret-management.sh backup staging

# Generate new secret values
./scripts/secret-management.sh generate-secret jwt
./scripts/secret-management.sh generate-secret api-key
```

### Command Reference

| Command | Description | Options |
|---------|-------------|---------|
| `validate <env>` | Validate all secrets | `--dry-run` |
| `health-check <env>` | Health monitoring | `--verbose` |
| `list <env>` | List environment secrets | None |
| `rotate-jwt <env>` | Rotate JWT secret | `--dry-run` |
| `backup <env>` | Backup metadata | None |
| `test-connectivity <env>` | Test secret access | None |
| `deploy-stack <env>` | Deploy infra | `--dry-run` |
| `generate-secret <type>` | Generate new values | Types: jwt, password, api-key, uuid |

### Environment Variables

```bash
# AWS configuration
export AWS_REGION=ap-southeast-1
export AWS_PROFILE=namecard-staging

# Tool options
export DRY_RUN=true
export VERBOSE=true
```

## Security Best Practices

### Secret Rotation

1. **JWT Secrets**: Rotate every 30-90 days
2. **API Keys**: Rotate when compromised or every 90 days
3. **Database Passwords**: Rotate every 90-180 days
4. **Automation**: Use GitHub Actions for consistent rotation

### Access Control

1. **IAM Policies**: Principle of least privilege
2. **Environment Separation**: Separate secrets per environment
3. **Audit Logging**: All secret access is logged
4. **GitHub Secrets**: Store AWS credentials securely

### Monitoring

1. **Health Checks**: Daily automated monitoring
2. **Age Alerts**: Warning for secrets older than 90 days
3. **Access Patterns**: Monitor unusual access patterns
4. **Backup Verification**: Regular backup validation

## Infrastructure as Code

### SecretsStack

The `SecretsStack` defines all secret resources:

```typescript
// infra/lib/secrets-stack.ts
export class SecretsStack extends Stack {
  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    // Database secrets
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `namecard/database/${environment}`,
      description: `Database credentials for ${environment}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'namecard_user',
          dbname: `namecard_${environment}`,
        }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      },
    });

    // API secrets
    const apiSecret = new secretsmanager.Secret(this, 'APISecret', {
      secretName: `namecard/api/${environment}`,
      description: `API secrets for ${environment}`,
      secretStringValue: SecretValue.unsafePlainText(JSON.stringify({
        JWT_SECRET: props.jwtSecret,
        PERPLEXITY_API_KEY: props.perplexityApiKey,
      })),
    });
  }
}
```

### Deployment

Deploy secrets infra:

```bash
cd infra

# Deploy to staging
npx cdk deploy NameCardSecrets-staging --context environment=staging

# Deploy to production  
npx cdk deploy NameCardSecrets-production --context environment=production
```

## Troubleshooting

### Common Issues

1. **Secret Not Found**
   ```bash
   # Check if secret exists
   aws secretsmanager list-secrets --filters Key=name,Values=namecard
   
   # Deploy secrets stack
   ./scripts/secret-management.sh deploy-stack staging
   ```

2. **Access Denied**
   ```bash
   # Check AWS credentials
   aws sts get-caller-identity
   
   # Verify IAM permissions for Secrets Manager
   aws iam get-user-policy --user-name your-user --policy-name SecretsManagerAccess
   ```

3. **Invalid Secret Structure**
   ```bash
   # Validate secret structure
   ./scripts/secret-management.sh validate staging --verbose
   
   # Fix structure by updating secret
   aws secretsmanager update-secret --secret-id namecard/api/staging --secret-string '{...}'
   ```

4. **ECS Service Not Picking Up New Secrets**
   ```bash
   # Force ECS service restart
   aws ecs update-service --cluster namecard-cluster-staging --service namecard-api-staging --force-new-deployment
   
   # Check service status
   aws ecs describe-services --cluster namecard-cluster-staging --services namecard-api-staging
   ```

### Health Check Failures

If health checks fail:

1. **Run detailed health check**:
   ```bash
   ./scripts/secret-management.sh health-check staging --verbose
   ```

2. **Check AWS CloudTrail** for secret access patterns

3. **Verify ECS service logs**:
   ```bash
   aws logs get-log-events --log-group-name /namecard/api-service/staging --log-stream-name <stream-name>
   ```

4. **Test connectivity manually**:
   ```bash
   ./scripts/secret-management.sh test-connectivity staging
   ```

## Emergency Procedures

### Secret Compromise

If a secret is compromised:

1. **Immediate rotation**:
   ```bash
   # Rotate JWT secret immediately
   ./scripts/secret-management.sh rotate-jwt production
   
   # Rotate other API keys manually through AWS console
   ```

2. **Update applications**:
   - ECS services will automatically restart
   - Verify all services are healthy
   - Monitor application logs for errors

3. **Audit access**:
   - Check CloudTrail logs
   - Review recent secret access patterns
   - Document incident and response

### Backup and Recovery

1. **Create backup**:
   ```bash
   ./scripts/secret-management.sh backup production
   ```

2. **Store backup securely** (metadata only, not secret values)

3. **Recovery process**:
   - Redeploy secrets infra
   - Restore from backup metadata
   - Generate new secret values
   - Update applications

## Compliance and Auditing

### Audit Trail

All secret operations are tracked:
- **AWS CloudTrail**: API calls to Secrets Manager
- **GitHub Actions**: Workflow execution logs  
- **Application Logs**: Secret retrieval and usage

### Compliance Requirements

- **PCI DSS**: Secure storage and rotation of payment-related secrets
- **SOC 2**: Access controls and monitoring
- **GDPR**: Secure handling of user data encryption keys

### Reporting

Generate compliance reports:

```bash
# Health status report
./scripts/secret-management.sh health-check production --verbose > health-report.txt

# Backup metadata for audit
./scripts/secret-management.sh backup production

# Review GitHub Actions workflow history for secret operations
gh run list --workflow=secret-management.yml
```

## Adding New Secrets - Complete Workflow

### Scenario 1: Adding a New API Key Secret

When you need to add a new third-party API integration:

1. **Update Infrastructure Code**:
   ```typescript
   // infra/lib/secrets-stack.ts
   const newApiSecret = new secretsmanager.Secret(this, 'NewAPISecret', {
     secretName: `namecard/new-api/${environment}`,
     description: `New API credentials for ${environment}`,
     secretStringValue: SecretValue.unsafePlainText(JSON.stringify({
       API_KEY: props.newApiKey,
       API_SECRET: props.newApiSecret,
     })),
   });
   ```

2. **Push to Feature Branch**:
   ```bash
   git add infra/lib/secrets-stack.ts
   git commit -m "feat: Add new API secret infra"
   git push origin feature/new-api-integration
   ```

3. **Create Pull Request**:
   - **Automatic**: Secret management workflow validates the changes
   - **Manual**: Review and approve the PR

4. **Merge to Main**:
   ```bash
   git checkout main
   git pull origin main
   # Push triggers automatic deployment
   ```

5. **Automatic Deployment**:
   - Secret change detection runs
   - New secrets are deployed to staging/production
   - Validation confirms secrets are accessible
   - Integration with main deployment pipeline

### Scenario 2: Adding Secrets for New Environment

When creating a new environment (e.g., `development`):

1. **Manual Deployment**:
   ```bash
   # Deploy new environment secrets
   gh workflow run secret-management.yml \
     -f operation=update-secrets \
     -f environment=development \
     -f dry_run=false
   ```

2. **Or Use Local Tool**:
   ```bash
   ./scripts/secret-management.sh deploy-stack development
   ./scripts/secret-management.sh validate development
   ```

### Scenario 3: Emergency Secret Rotation

When a secret is compromised:

1. **Immediate Rotation**:
   ```bash
   gh workflow run secret-management.yml \
     -f operation=rotate-api-keys \
     -f environment=production \
     -f dry_run=false
   ```

2. **Monitor Services**:
   - ECS services automatically restart
   - Applications pick up new secrets
   - Health checks validate functionality

## Integration with Development Workflow

### Local Development

For local development, use development environment secrets:

```bash
# Set up local environment
export AWS_PROFILE=namecard-development

# Validate development secrets
./scripts/secret-management.sh validate development

# Get database connection string
aws secretsmanager get-secret-value --secret-id namecard/database/development --query 'SecretString' --output text | jq -r '.host'
```

### CI/CD Integration

The secret management system integrates with existing CI/CD workflows:

1. **Pre-deployment validation**: Secrets are validated before deployments
2. **Post-deployment verification**: Health checks after infra updates
3. **Automated rotation**: Regular rotation through scheduled workflows
4. **Emergency response**: Manual workflows for incident response

This comprehensive secret management system ensures secure, auditable, and maintainable handling of sensitive data across all environments of the NameCard application.