# Frontend Dockerfile - Multi-stage build for React app with Nginx using pnpm workspaces
FROM node:20-alpine AS builder
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY services/web/package.json services/web/
COPY services/shared/package.json services/shared/
COPY services/web/tsconfig.json services/web/
COPY services/shared/tsconfig.json services/shared/
COPY services/shared/prisma services/shared/prisma

RUN pnpm install --frozen-lockfile

COPY services/web services/web
COPY services/shared services/shared

RUN pnpm --filter @namecard/shared run build
RUN pnpm --filter @namecard/web run build

FROM nginx:alpine

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001 -G nodejs

COPY services/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder --chown=nextjs:nodejs /app/services/web/dist /usr/share/nginx/html
COPY --chown=nextjs:nodejs services/web/env-template.js /usr/share/nginx/html/env-template.js
COPY services/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && chown nextjs:nodejs /docker-entrypoint.sh \
  && chown -R nextjs:nodejs /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/docker-entrypoint.sh"]
