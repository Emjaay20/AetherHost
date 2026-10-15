FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/
COPY libs/domain/package.json ./libs/domain/
COPY libs/common/package.json ./libs/common/
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm && pnpm install --no-frozen-lockfile

FROM deps AS builder
WORKDIR /app
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BASE_DOMAIN
ARG NEXT_PUBLIC_DEMO_MODE
ARG NEXT_PUBLIC_USE_TRAEFIK
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_USE_TRAEFIK=$NEXT_PUBLIC_USE_TRAEFIK
COPY . .
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN pnpm --filter @aetherhost/common build && pnpm --filter @aetherhost/domain build && pnpm --filter dashboard build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
COPY --from=builder --chown=node:node /app/apps/dashboard/public ./public
COPY --from=builder --chown=node:node /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder --chown=node:node /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/dashboard/server.js"]
