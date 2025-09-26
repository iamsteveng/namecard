# Multi-stage build for backend API service using pnpm workspaces
FROM node:20-slim AS base
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY services/shared/package.json services/shared/
COPY services/api/package.json services/api/
COPY services/shared/tsconfig.json services/shared/
COPY services/api/tsconfig.json services/api/

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY services/shared services/shared
COPY services/api services/api

RUN pnpm --filter @namecard/shared run build
RUN pnpm --filter @namecard/api run build
RUN pnpm --filter @namecard/api exec prisma generate

FROM node:20-slim AS production
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable \
  && apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends dumb-init curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nodejs \
  && useradd -r -u 1001 -g nodejs -s /bin/false nodejs

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY services/shared/package.json services/shared/
COPY services/api/package.json services/api/
COPY --from=build /app/services/api/prisma services/api/prisma

RUN pnpm install --frozen-lockfile --filter @namecard/api... --prod

COPY --from=build /app/services/shared/dist services/shared/dist
COPY --from=build /app/services/api/dist services/api/dist

RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) { process.exit(0); } \
      else { process.exit(1); } \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/api/dist/server.js"]
