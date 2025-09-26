#!/bin/bash

# Database Migration Script for NameCard App
# Supports both local development and production deployment

set -e

ENVIRONMENT=${1:-staging}
MIGRATION_TYPE=${2:-deploy}

echo "🔄 Running database migration for $ENVIRONMENT environment..."

if [ "$ENVIRONMENT" = "local" ]; then
    # Local development migration
    echo "📍 Local development migration"
    cd services/api
    
    if [ "$MIGRATION_TYPE" = "dev" ]; then
        # Create new migration (interactive)
        echo "Creating new migration..."
        pnpm exec prisma migrate dev
    else
        # Deploy existing migrations
        echo "Deploying migrations..."
        pnpm exec prisma migrate deploy
    fi
    
elif [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "production" ]; then
    # Production migration using ECS task
    echo "🚀 Production migration via ECS task"
    
    AWS_PROFILE="namecard-${ENVIRONMENT}"
    ECS_CLUSTER="namecard-cluster-${ENVIRONMENT}"
    
    # Get database credentials
    DB_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "namecard/database/${ENVIRONMENT}" \
        --region ap-southeast-1 \
        --query 'SecretString' --output text \
        --profile "$AWS_PROFILE")
    
    DB_HOST=$(echo "$DB_SECRET" | jq -r '.host')
    DB_USER=$(echo "$DB_SECRET" | jq -r '.username')
    DB_PASS=$(echo "$DB_SECRET" | jq -r '.password')
    DB_NAME=$(echo "$DB_SECRET" | jq -r '.dbname')
    
    # URL encode password
    ENCODED_DB_PASS=$(echo "$DB_PASS" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=''))")
    DATABASE_URL="postgresql://${DB_USER}:${ENCODED_DB_PASS}@${DB_HOST}:5432/${DB_NAME}?sslmode=require"
    
    # Run ECS migration task
    echo "Starting ECS migration task..."
    TASK_ARN=$(aws ecs run-task \
        --cluster "$ECS_CLUSTER" \
        --task-definition "NameCardProd${ENVIRONMENT}APIServiceTaskDef909B2074" \
        --launch-type FARGATE \
        --network-configuration 'awsvpcConfiguration={subnets=["subnet-08cef10adb4cf31e6","subnet-00ca2562f3fabffaf"],securityGroups=["sg-0aa8f05b02d726a66"],assignPublicIp=ENABLED}' \
        --overrides "{\"containerOverrides\":[{\"name\":\"namecard-api\",\"command\":[\"sh\",\"-c\",\"cd /app/services/api && pnpm exec prisma migrate deploy\"],\"environment\":[{\"name\":\"DATABASE_URL\",\"value\":\"$DATABASE_URL\"}]}]}" \
        --region ap-southeast-1 \
        --profile "$AWS_PROFILE" \
        --query 'tasks[0].taskArn' --output text)
    
    TASK_ID=$(echo "$TASK_ARN" | sed 's/.*\///')
    echo "Migration task: $TASK_ID"
    
    # Wait for completion
    echo "⏳ Waiting for migration to complete..."
    aws ecs wait tasks-stopped \
        --cluster "$ECS_CLUSTER" \
        --tasks "$TASK_ID" \
        --region ap-southeast-1 \
        --profile "$AWS_PROFILE"
    
    # Check result
    EXIT_CODE=$(aws ecs describe-tasks \
        --cluster "$ECS_CLUSTER" \
        --tasks "$TASK_ID" \
        --region ap-southeast-1 \
        --profile "$AWS_PROFILE" \
        --query 'tasks[0].containers[0].exitCode' --output text)
    
    if [ "$EXIT_CODE" = "0" ]; then
        echo "✅ Migration completed successfully!"
    else
        echo "❌ Migration failed! Exit code: $EXIT_CODE"
        exit 1
    fi
    
else
    echo "❌ Invalid environment: $ENVIRONMENT"
    echo "Usage: $0 [local|staging|production] [deploy|dev]"
    exit 1
fi

echo "🎉 Database migration completed!"
