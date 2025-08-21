#!/bin/bash

# Secret Management Utility Script
# This script provides utilities for managing secrets in the NameCard application
# Compatible with both local development and CI/CD environments

set -euo pipefail

# Configuration
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Help function
show_help() {
    cat << EOF
Secret Management Utility for NameCard Application

USAGE:
    $0 <command> [options]

COMMANDS:
    validate <environment>     - Validate all secrets for environment
    health-check <environment> - Comprehensive health check of secrets
    list <environment>         - List all secrets for environment
    rotate-jwt <environment>   - Rotate JWT secret
    backup <environment>       - Backup secret metadata
    test-connectivity <env>    - Test secret connectivity
    deploy-stack <environment> - Deploy secrets stack
    generate-secret <type>     - Generate new secret value

OPTIONS:
    -h, --help                 - Show this help message
    -d, --dry-run              - Perform dry run (no changes made)
    -v, --verbose              - Verbose output
    -r, --region <region>      - AWS region (default: ap-southeast-1)

EXAMPLES:
    $0 validate staging
    $0 health-check production --verbose
    $0 rotate-jwt staging --dry-run
    $0 backup production
    $0 deploy-stack staging

ENVIRONMENT VARIABLES:
    AWS_REGION                 - AWS region for secrets (default: ap-southeast-1)
    AWS_PROFILE                - AWS profile to use
    DRY_RUN                    - Set to 'true' for dry run mode
    VERBOSE                    - Set to 'true' for verbose output
EOF
}

# Utility functions
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi
}

check_jq() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed or not in PATH"
        exit 1
    fi
}

check_environment() {
    local env="$1"
    if [[ ! "$env" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $env. Must be one of: development, staging, production"
        exit 1
    fi
}

# Function to validate secrets
validate_secrets() {
    local environment="$1"
    local dry_run="${2:-false}"
    
    log_info "Validating secrets for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    # Define expected secrets
    local secrets=(
        "namecard/database/$environment"
        "namecard/api/$environment"
    )
    
    local all_valid=true
    local validation_report=""
    
    for secret in "${secrets[@]}"; do
        log_info "Checking secret: $secret"
        
        if aws secretsmanager describe-secret --secret-id "$secret" --region "$AWS_REGION" > /dev/null 2>&1; then
            log_success "Secret exists: $secret"
            validation_report+="✅ $secret: EXISTS\n"
            
            # Test secret retrieval
            if aws secretsmanager get-secret-value --secret-id "$secret" --region "$AWS_REGION" --query 'SecretString' --output text > /dev/null 2>&1; then
                log_success "Secret accessible: $secret"
                validation_report+="✅ $secret: ACCESSIBLE\n"
                
                # Validate secret structure
                local secret_value
                secret_value=$(aws secretsmanager get-secret-value --secret-id "$secret" --region "$AWS_REGION" --query 'SecretString' --output text)
                
                if [[ "$secret" == *"/database/"* ]]; then
                    if echo "$secret_value" | jq -e '.host and .username and .password and .dbname' > /dev/null 2>&1; then
                        log_success "Database secret structure valid: $secret"
                        validation_report+="✅ $secret: STRUCTURE VALID\n"
                    else
                        log_error "Database secret structure invalid: $secret"
                        validation_report+="❌ $secret: STRUCTURE INVALID\n"
                        all_valid=false
                    fi
                elif [[ "$secret" == *"/api/"* ]]; then
                    if echo "$secret_value" | jq -e '.JWT_SECRET' > /dev/null 2>&1; then
                        log_success "API secret structure valid: $secret"
                        validation_report+="✅ $secret: STRUCTURE VALID\n"
                    else
                        log_error "API secret structure invalid: $secret"
                        validation_report+="❌ $secret: STRUCTURE INVALID\n"
                        all_valid=false
                    fi
                fi
            else
                log_error "Secret not accessible: $secret"
                validation_report+="❌ $secret: NOT ACCESSIBLE\n"
                all_valid=false
            fi
        else
            log_error "Secret missing: $secret"
            validation_report+="❌ $secret: MISSING\n"
            all_valid=false
        fi
    done
    
    echo ""
    echo "📊 VALIDATION SUMMARY"
    echo "===================="
    echo -e "$validation_report"
    
    if [ "$all_valid" = true ]; then
        log_success "All secrets validation passed for environment: $environment"
        return 0
    else
        log_error "Secret validation failed for environment: $environment"
        return 1
    fi
}

# Function for comprehensive health check
health_check() {
    local environment="$1"
    local verbose="${2:-false}"
    
    log_info "Performing health check for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    local secrets=(
        "namecard/database/$environment"
        "namecard/api/$environment"
    )
    
    local overall_health="healthy"
    
    for secret in "${secrets[@]}"; do
        log_info "Health check for secret: $secret"
        
        if ! aws secretsmanager describe-secret --secret-id "$secret" --region "$AWS_REGION" > /dev/null 2>&1; then
            log_error "Secret does not exist: $secret"
            overall_health="unhealthy"
            continue
        fi
        
        # Get secret metadata
        local secret_meta
        secret_meta=$(aws secretsmanager describe-secret --secret-id "$secret" --region "$AWS_REGION")
        
        local last_changed
        last_changed=$(echo "$secret_meta" | jq -r '.LastChangedDate')
        
        if [ "$verbose" = true ]; then
            local last_accessed
            last_accessed=$(echo "$secret_meta" | jq -r '.LastAccessedDate // "Never"')
            
            echo "  📅 Last changed: $last_changed"
            echo "  📅 Last accessed: $last_accessed"
        fi
        
        # Check secret age (warn if older than 90 days)
        if [ "$last_changed" != "null" ]; then
            local last_changed_epoch
            last_changed_epoch=$(date -d "$last_changed" +%s 2>/dev/null || echo "0")
            local current_epoch
            current_epoch=$(date +%s)
            local age_days=$(( (current_epoch - last_changed_epoch) / 86400 ))
            
            if [ "$verbose" = true ]; then
                echo "  📊 Secret age: $age_days days"
            fi
            
            if [ $age_days -gt 90 ]; then
                log_warning "Secret is older than 90 days - consider rotation: $secret"
            fi
        fi
        
        # Test secret retrieval
        if ! aws secretsmanager get-secret-value --secret-id "$secret" --region "$AWS_REGION" --query 'SecretString' --output text > /dev/null 2>&1; then
            log_error "Secret retrieval failed: $secret"
            overall_health="unhealthy"
            continue
        fi
        
        log_success "Secret health check passed: $secret"
    done
    
    echo ""
    echo "📊 HEALTH CHECK SUMMARY"
    echo "======================="
    echo "Environment: $environment"
    echo "Overall Status: $overall_health"
    echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    
    if [ "$overall_health" = "healthy" ]; then
        log_success "All secrets are healthy for environment: $environment"
        return 0
    else
        log_error "One or more secrets have health issues for environment: $environment"
        return 1
    fi
}

# Function to list secrets
list_secrets() {
    local environment="$1"
    
    log_info "Listing secrets for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    local secrets
    secrets=$(aws secretsmanager list-secrets \
        --filters Key=name,Values=namecard \
        --region "$AWS_REGION" \
        --query "SecretList[?contains(Name, '$environment')]")
    
    echo ""
    echo "📋 SECRETS LIST"
    echo "==============="
    echo "Environment: $environment"
    echo "Region: $AWS_REGION"
    echo ""
    
    echo "$secrets" | jq -r '.[] | "🔒 \(.Name)\n   Description: \(.Description // "N/A")\n   Created: \(.CreatedDate)\n   Last Changed: \(.LastChangedDate)\n"'
    
    local count
    count=$(echo "$secrets" | jq '. | length')
    echo "Total secrets found: $count"
}

# Function to rotate JWT secret
rotate_jwt() {
    local environment="$1"
    local dry_run="${2:-false}"
    
    log_info "Rotating JWT secret for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    local secret_name="namecard/api/$environment"
    
    if [ "$dry_run" = true ]; then
        local new_jwt_secret
        new_jwt_secret=$(openssl rand -base64 32)
        log_info "DRY RUN: Would generate new JWT secret: ${new_jwt_secret:0:8}..."
        log_info "DRY RUN: Would update secret: $secret_name"
        log_info "DRY RUN: Would restart ECS service: namecard-api-$environment"
        return 0
    fi
    
    # Generate new JWT secret
    local new_jwt_secret
    new_jwt_secret=$(openssl rand -base64 32)
    log_info "Generated new JWT secret: ${new_jwt_secret:0:8}..."
    
    # Get current API secret
    local current_secret
    current_secret=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$AWS_REGION" --query 'SecretString' --output text)
    
    # Update JWT_SECRET while preserving other fields
    local updated_secret
    updated_secret=$(echo "$current_secret" | jq --arg jwt "$new_jwt_secret" '.JWT_SECRET = $jwt')
    
    # Update the secret in AWS Secrets Manager
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$updated_secret" \
        --description "JWT secret rotated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')" \
        --region "$AWS_REGION"
    
    log_success "JWT secret rotated successfully"
    
    # Trigger ECS service restart to pick up new secret
    log_info "Restarting ECS service to apply new secret..."
    aws ecs update-service \
        --cluster "namecard-cluster-$environment" \
        --service "namecard-api-$environment" \
        --force-new-deployment \
        --region "$AWS_REGION"
    
    log_success "ECS service restart initiated"
}

# Function to backup secret metadata
backup_secrets() {
    local environment="$1"
    
    log_info "Backing up secret metadata for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    # Create backup directory
    local backup_dir="$PROJECT_ROOT/secret-backups"
    mkdir -p "$backup_dir"
    
    local backup_file="$backup_dir/secrets-metadata-$environment-$(date +%Y%m%d-%H%M%S).json"
    
    # Get all secrets with namecard prefix for the environment
    local secrets
    secrets=$(aws secretsmanager list-secrets \
        --filters Key=name,Values=namecard \
        --region "$AWS_REGION" \
        --query "SecretList[?contains(Name, '$environment')]")
    
    # Create backup object with metadata only (no secret values)
    local backup_data
    backup_data=$(echo "$secrets" | jq --arg timestamp "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" --arg env "$environment" --arg region "$AWS_REGION" '{
        backup_timestamp: $timestamp,
        environment: $env,
        region: $region,
        secrets: [.[] | {
            name: .Name,
            description: .Description,
            created_date: .CreatedDate,
            last_changed_date: .LastChangedDate,
            last_accessed_date: .LastAccessedDate,
            version_id: .VersionId,
            tags: .Tags
        }]
    }')
    
    # Save backup
    echo "$backup_data" > "$backup_file"
    
    log_success "Secret metadata backup created: $backup_file"
    
    echo "📊 Backup summary:"
    local secret_count
    secret_count=$(echo "$backup_data" | jq '.secrets | length')
    echo "- Number of secrets: $secret_count"
    echo "$backup_data" | jq -r '.secrets[].name' | sed 's/^/- /'
}

# Function to test connectivity
test_connectivity() {
    local environment="$1"
    
    log_info "Testing secret connectivity for environment: $environment"
    
    check_environment "$environment"
    check_aws_cli
    check_jq
    
    # Test database secret connectivity
    local db_secret_name="namecard/database/$environment"
    log_info "Testing database secret connectivity..."
    
    if ! aws secretsmanager get-secret-value --secret-id "$db_secret_name" --region "$AWS_REGION" > /dev/null 2>&1; then
        log_error "Cannot retrieve database secret: $db_secret_name"
        return 1
    fi
    
    local db_secret
    db_secret=$(aws secretsmanager get-secret-value --secret-id "$db_secret_name" --region "$AWS_REGION" --query 'SecretString' --output text)
    
    local db_host
    db_host=$(echo "$db_secret" | jq -r '.host // empty')
    
    if [ -n "$db_host" ] && [ "$db_host" != "null" ]; then
        log_success "Database secret structure valid - host: $db_host"
    else
        log_error "Database secret missing required 'host' field"
        return 1
    fi
    
    # Test API secret connectivity
    local api_secret_name="namecard/api/$environment"
    log_info "Testing API secret connectivity..."
    
    if ! aws secretsmanager get-secret-value --secret-id "$api_secret_name" --region "$AWS_REGION" > /dev/null 2>&1; then
        log_error "Cannot retrieve API secret: $api_secret_name"
        return 1
    fi
    
    local api_secret
    api_secret=$(aws secretsmanager get-secret-value --secret-id "$api_secret_name" --region "$AWS_REGION" --query 'SecretString' --output text)
    
    local jwt_secret
    jwt_secret=$(echo "$api_secret" | jq -r '.JWT_SECRET // empty')
    
    if [ -n "$jwt_secret" ] && [ "$jwt_secret" != "null" ]; then
        log_success "API secret structure valid - JWT_SECRET present"
    else
        log_error "API secret missing required 'JWT_SECRET' field"
        return 1
    fi
    
    log_success "All secret connectivity tests passed for environment: $environment"
}

# Function to deploy secrets stack
deploy_stack() {
    local environment="$1"
    local dry_run="${2:-false}"
    
    log_info "Deploying secrets stack for environment: $environment"
    
    check_environment "$environment"
    
    local infra_dir="$PROJECT_ROOT/infrastructure"
    
    if [ ! -d "$infra_dir" ]; then
        log_error "Infrastructure directory not found: $infra_dir"
        return 1
    fi
    
    cd "$infra_dir"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing infrastructure dependencies..."
        npm ci
    fi
    
    if [ "$dry_run" = true ]; then
        log_info "DRY RUN: Synthesizing secrets stack..."
        npx cdk synth "NameCardSecrets-$environment" --context "environment=$environment"
        
        log_info "DRY RUN: Showing deployment diff..."
        npx cdk diff "NameCardSecrets-$environment" --context "environment=$environment"
    else
        log_info "Deploying secrets stack..."
        npx cdk deploy "NameCardSecrets-$environment" \
            --context "environment=$environment" \
            --require-approval never \
            --outputs-file "secrets-outputs-$environment.json"
        
        log_success "Secrets stack deployed successfully for environment: $environment"
    fi
}

# Function to generate secret values
generate_secret() {
    local secret_type="$1"
    
    case "$secret_type" in
        "jwt")
            openssl rand -base64 32
            ;;
        "password")
            openssl rand -base64 24
            ;;
        "api-key")
            openssl rand -hex 32
            ;;
        "uuid")
            if command -v uuidgen &> /dev/null; then
                uuidgen
            else
                cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "UUID generation not available"
            fi
            ;;
        *)
            log_error "Unknown secret type: $secret_type"
            echo "Available types: jwt, password, api-key, uuid"
            return 1
            ;;
    esac
}

# Parse command line arguments
DRY_RUN=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

# Main command processing
if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

command="$1"
shift

case "$command" in
    "validate")
        if [ $# -eq 0 ]; then
            log_error "Environment required for validate command"
            exit 1
        fi
        validate_secrets "$1" "$DRY_RUN"
        ;;
    "health-check")
        if [ $# -eq 0 ]; then
            log_error "Environment required for health-check command"
            exit 1
        fi
        health_check "$1" "$VERBOSE"
        ;;
    "list")
        if [ $# -eq 0 ]; then
            log_error "Environment required for list command"
            exit 1
        fi
        list_secrets "$1"
        ;;
    "rotate-jwt")
        if [ $# -eq 0 ]; then
            log_error "Environment required for rotate-jwt command"
            exit 1
        fi
        rotate_jwt "$1" "$DRY_RUN"
        ;;
    "backup")
        if [ $# -eq 0 ]; then
            log_error "Environment required for backup command"
            exit 1
        fi
        backup_secrets "$1"
        ;;
    "test-connectivity")
        if [ $# -eq 0 ]; then
            log_error "Environment required for test-connectivity command"
            exit 1
        fi
        test_connectivity "$1"
        ;;
    "deploy-stack")
        if [ $# -eq 0 ]; then
            log_error "Environment required for deploy-stack command"
            exit 1
        fi
        deploy_stack "$1" "$DRY_RUN"
        ;;
    "generate-secret")
        if [ $# -eq 0 ]; then
            log_error "Secret type required for generate-secret command"
            exit 1
        fi
        generate_secret "$1"
        ;;
    *)
        log_error "Unknown command: $command"
        show_help
        exit 1
        ;;
esac