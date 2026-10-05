# Base image
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY libs/domain/package.json ./libs/domain/
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd apps/api && npx prisma generate
RUN pnpm --filter @aetherhost/api build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/libs/domain ./libs/domain
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
