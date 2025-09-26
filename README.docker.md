# Docker Environment Setup

This project uses a unified environment configuration - the same `.env` file works for both local development and Docker containers.

## Quick Start

1. **Configure environment variables:**
   ```bash
   # Edit services/api/.env with your AWS credentials
   cd services/api
   nano .env  # or use your preferred editor
   ```

2. **Start the services:**
   ```bash
   docker-compose up -d
   ```

The Docker container automatically uses `services/api/.env` and overrides only the networking-specific variables (database and Redis URLs).

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
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Restart API service
docker-compose restart api

# Stop all services  
docker-compose down

# Clean up (removes containers and volumes)
docker-compose down -v
```
