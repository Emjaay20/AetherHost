# Base image
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY libs/domain/package.json ./libs/domain/
COPY libs/common/package.json ./libs/common/
RUN pnpm install --frozen-lockfile

# Build stage
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @aetherhost/common build
RUN pnpm --filter @aetherhost/domain build
RUN pnpm --filter @aetherhost/api exec prisma generate
RUN pnpm --filter @aetherhost/api build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/libs/domain ./libs/domain
COPY --from=builder --chown=node:node /app/libs/common ./libs/common
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/v1/health || exit 1
CMD ["sh", "-c", "cd apps/api && ./node_modules/.bin/prisma migrate deploy && cd /app && node apps/api/dist/main.js"]
