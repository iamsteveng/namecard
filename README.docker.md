# Docker Environment Setup

This project uses a unified environment configuration - the same `.env` file works for both local development and Docker containers.

## Quick Start

1. **Bootstrap the entire local environment:**
   ```bash
   pnpm run onboard:local
   ```
   This installs dependencies, prepares `.env` files, applies database migrations, seeds baseline data, starts Docker services (Postgres, Redis, LocalStack, API, frontend), and finishes by running the automated smoke suite.

2. **Subsequent runs:**
   ```bash
   pnpm run fullstack:up      # restart the local stack with health checks
   pnpm run smoke:local       # re-verify after making changes
   ```

The onboarding script manages `services/api/.env` (Docker overrides) and `services/api/.env.localstack` automatically, so you only need to adjust the checked-in `.env.example` files when introducing new configuration.

## Unified Configuration

Both local development and Docker use the same `services/api/.env` file:

### Automatic Docker Overrides
Docker Compose automatically overrides these variables for container networking:
- `DATABASE_URL` → Uses `postgres:5432` (Docker service name)
- `REDIS_URL` → Uses `redis:6379` (Docker service name)

### Environment Variables
All other variables are shared between local and Docker:
- **AWS credentials and configuration**
- **Cognito settings**  
- **API keys and secrets**
- **CORS, rate limiting, logging settings**

## Security Notes

- The `services/api/.env` file is already in `.gitignore`
- Use different AWS credentials for development/staging/production
- Rotate AWS credentials regularly

## Commands

```bash
# One-and-done bootstrap
pnpm run onboard:local

# Start all services after developing
pnpm run fullstack:up

# Run local smoke suite
pnpm run smoke:local

# View logs
docker-compose logs -f api

# Restart API service
docker-compose restart api

# Stop all services  
docker-compose down

# Clean up (removes containers and volumes)
docker-compose down -v
```

## Lambda Sandbox

Use the lightweight Lambda sandbox to exercise the individual handlers without deploying to AWS:

```bash
pnpm run lambda:sandbox
# Invoke a handler
curl -X POST http://localhost:4100/invoke/search -H 'Content-Type: application/json' \
  -d '{"event": {"version":"2.0","rawPath":"/search","requestContext":{"http":{"method":"GET"}}}}'
```

The sandbox loads the TypeScript Lambda handlers directly via `esbuild-register`, mirroring the API Gateway event shape so you can iterate on serverless code locally.
