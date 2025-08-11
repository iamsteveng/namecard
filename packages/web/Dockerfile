# Frontend Dockerfile - Multi-stage build for React app with Nginx
# Stage 1: Build the React application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/web ./packages/web/
COPY packages/shared ./packages/shared/

# Copy configuration files
COPY turbo.json ./
COPY tsconfig.json ./

# Set working directory to web package
WORKDIR /app/packages/web

# Build the React application (skip TypeScript check for production)
RUN npx vite build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy custom Nginx configuration
COPY packages/web/nginx.conf /etc/nginx/nginx.conf

# Copy built React application
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/dist /usr/share/nginx/html

# Copy environment template for runtime variable injection
COPY --chown=nextjs:nodejs packages/web/env-template.js /usr/share/nginx/html/env-template.js

# Create startup script for environment variable injection
COPY packages/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    chown nextjs:nodejs /docker-entrypoint.sh && \
    chown -R nextjs:nodejs /usr/share/nginx/html

# Note: Nginx needs to run as root for port 80 and cache directories
# The nextjs user owns the HTML files but nginx runs as root

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start Nginx with custom entrypoint
CMD ["/docker-entrypoint.sh"]