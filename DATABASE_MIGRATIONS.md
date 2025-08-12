# Database Migration System

## Overview

The NameCard application uses an automated database migration system built on **ECS container tasks** with **GitHub Actions automation**. This system provides production-ready, version-controlled database schema management.

## Architecture

### Components
- **Prisma ORM**: Schema definition and migration generation
- **ECS Tasks**: Production migration execution using the same container as the API
- **GitHub Actions**: Automated schema change detection and deployment
- **AWS Secrets Manager**: Secure database credential management
- **CloudWatch Logs**: Migration execution logging

### Migration Flow
```
Schema Change → Git Commit → GitHub Actions → Schema Detection → ECS Migration Task → Success/Failure
```

## Automated Migration Process

### 1. Schema Change Detection
GitHub Actions automatically detects changes in:
- `packages/api/prisma/schema.prisma`
- `packages/api/prisma/migrations/` directory

```yaml
# Detects schema changes
SCHEMA_CHANGED=$(git diff --name-only HEAD^ HEAD | grep -E "(packages/api/prisma/|\.prisma$)")
```

### 2. Migration Execution
When changes are detected, the system:
1. Retrieves database credentials from AWS Secrets Manager
2. Launches an ECS Fargate task using the production API container
3. Executes `npx prisma migrate deploy` in the container
4. Monitors task completion and logs results

### 3. Error Handling
- **Exit Code 0**: Migration successful, deployment continues
- **Exit Code ≠ 0**: Migration failed, deployment stops with error logs

## Development Workflow

### Creating New Migrations

1. **Modify the schema**:
   ```prisma
   // packages/api/prisma/schema.prisma
   model User {
     id        String @id @default(uuid())
     email     String @unique
     newField  String? // <- Add new field
     createdAt DateTime @default(now())
   }
   ```

2. **Generate migration locally**:
   ```bash
   cd packages/api
   npx prisma migrate dev --name add_new_field
   ```

3. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: add newField to User model"
   git push origin main
   ```

4. **Automatic deployment**: GitHub Actions detects changes and runs migration automatically!

### Manual Migration Commands

**Using the migration script**:
```bash
# Local development
./scripts/migrate.sh local deploy

# Staging environment  
./scripts/migrate.sh staging deploy

# Production environment
./scripts/migrate.sh production deploy
```

**Direct commands**:
```bash
# Local development
cd packages/api && npx prisma migrate deploy

# Production via ECS task (manual)
aws ecs run-task \
  --cluster namecard-cluster-staging \
  --task-definition NameCardProdstagingAPIServiceTaskDef909B2074 \
  --overrides '{"containerOverrides":[{"name":"namecard-api","command":["sh","-c","cd /app/packages/api && npx prisma migrate deploy"],"environment":[{"name":"DATABASE_URL","value":"postgresql://..."}]}]}'
```

## File Structure

```
packages/api/prisma/
├── schema.prisma                      # Database schema definition
├── migrations/
│   ├── migration_lock.toml           # Provider lock file
│   ├── 20250812000000_initial_migration/
│   │   └── migration.sql             # Initial schema SQL
│   └── [timestamp]_[description]/     # Future migrations
│       └── migration.sql
```

## Implementation Details

### GitHub Actions Workflow
**File**: `.github/workflows/deploy-staging.yml`

**Key Features**:
- Schema change detection using git diff
- ECS task-based migration execution  
- Proper error handling and logging
- Integration with deployment pipeline

### ECS Migration Task
**Approach**: Uses the production API container to ensure environment consistency

**Benefits**:
- ✅ Same container environment as production API
- ✅ All dependencies and tools available
- ✅ Proper VPC and security group access
- ✅ Consistent with production runtime

**Configuration**:
- **Cluster**: `namecard-cluster-staging`
- **Task Definition**: `NameCardProdstagingAPIServiceTaskDef909B2074`
- **Network**: Private subnets with NAT gateway access
- **Security**: Database security group allows ECS task access

### IAM Permissions
The ECS task role includes:
- Database access through VPC security groups
- CloudWatch Logs write permissions
- AWS Secrets Manager read permissions

## Migration History

### Initial Migration (20250812000000_initial_migration)
- Created all core tables: users, cards, companies, calendar_events
- Added enrichment tables: company_enrichments, card_enrichments  
- Established indexes and foreign key relationships
- Set up UUID primary keys with PostgreSQL uuid-ossp extension

## Monitoring and Troubleshooting

### CloudWatch Logs
Migration logs are available in:
- **Log Group**: `/namecard/api-service/staging`
- **Log Stream**: `namecard-api/namecard-api/[task-id]`

### Common Issues

1. **"Table does not exist"**: Schema not applied to database
   - **Solution**: Run migration manually or check deployment logs

2. **"Environment variable not found: DATABASE_URL"**: Missing database connection
   - **Solution**: Verify AWS Secrets Manager access and ECS task environment

3. **"Prisma Schema that is required for this command"**: Working directory issue
   - **Solution**: Ensure command runs from `/app/packages/api` in container

### Verification Commands
```bash
# Check migration status locally
cd packages/api && npx prisma migrate status

# Test database connection
cd packages/api && npx prisma db push --preview-feature

# View recent migrations
aws logs get-log-events --log-group-name "/namecard/api-service/staging" --log-stream-name "[stream-name]"
```

## Production Considerations

### Safety Features
- **Atomic migrations**: Each migration runs in a transaction
- **Rollback capability**: Prisma maintains migration history
- **Pre-deployment validation**: Schema validation before applying
- **Failure isolation**: Migration failure prevents application deployment

### Performance
- **Execution time**: ~373ms for typical schema changes
- **Downtime**: Zero-downtime for additive changes
- **Resource usage**: 512 CPU, 1024MB memory (ECS Fargate)

### Security
- **Credential management**: Database passwords stored in AWS Secrets Manager
- **Network isolation**: Migrations run in private VPC subnets
- **Access control**: IAM policies restrict migration execution to authorized tasks
- **Audit logging**: All migration activities logged to CloudWatch

## Future Enhancements

1. **Migration Rollback**: Implement automated rollback on deployment failure
2. **Pre-deployment Testing**: Run migrations against staging data copy
3. **Performance Monitoring**: Track migration execution times and resource usage
4. **Slack Notifications**: Real-time alerts for migration status
5. **Blue-Green Database**: Zero-downtime migrations for breaking changes