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

# pnpm's workspace package node_modules entries are symlinks into the root
# virtual store.  Copying only apps/api/node_modules into the runner leaves
# those links dangling.  Produce a self-contained, production-only tree
# instead, so the runtime gets the Nest packages it needs without inheriting
# the workspace's development tooling.
RUN pnpm --filter @aetherhost/api deploy --legacy --prod /production

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# `pnpm deploy` creates a standalone API package with only runtime
# dependencies, including the workspace libraries resolved by the API.
COPY --from=builder --chown=node:node /production ./apps/api
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/v1/health || exit 1
CMD ["sh", "-c", "cd apps/api && ./node_modules/.bin/prisma migrate deploy && cd /app && node apps/api/dist/main.js"]
