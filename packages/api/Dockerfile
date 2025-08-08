# Multi-stage build for backend API service
# Stage 1: Build stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/shared/package*.json ./packages/shared/

# Copy TypeScript configuration files
COPY tsconfig.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/api/tsconfig.json ./packages/api/

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY packages/api ./packages/api/
COPY packages/shared ./packages/shared/

# Build shared package first
WORKDIR /app/packages/shared
RUN npm run build

# Build API package
WORKDIR /app/packages/api
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Production stage
FROM node:20-slim AS production

# Install security updates and required tools
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y dumb-init curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs -s /bin/false nodejs

# Set working directory
WORKDIR /app

# Copy package files for production install
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/api/package*.json ./packages/api/
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/

# Install only production dependencies (skip scripts to avoid husky issues)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built application and dependencies
COPY --from=builder /app/packages/api/dist ./packages/api/dist/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist/
COPY --from=builder /app/packages/api/prisma ./packages/api/prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (configurable via environment)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) { console.log('Health check passed'); process.exit(0); } \
      else { console.log('Health check failed:', res.statusCode); process.exit(1); } \
    }); \
    req.on('error', (err) => { console.log('Health check error:', err.message); process.exit(1); }); \
    req.on('timeout', () => { console.log('Health check timeout'); process.exit(1); }); \
    req.end();"

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3001

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "packages/api/dist/server.js"]