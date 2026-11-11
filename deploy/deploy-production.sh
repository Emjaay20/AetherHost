#!/usr/bin/env bash
set -euo pipefail

exec 9>/tmp/aetherhost-production-deploy.lock
if ! flock -n 9; then
  echo "⏭️  [CI/CD] A production deployment is already running; skipping this duplicate trigger."
  exit 0
fi

readonly control_plane_root="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
cd "$control_plane_root"

echo "🚀 [CI/CD] Starting automated production deployment..."

# 1. Pull latest code from GitHub
echo "📥 [CI/CD] Pulling latest code from origin/main..."
git pull --ff-only origin main

# 2. Build updated images using Docker cache
echo "🏗️ [CI/CD] Building updated container images..."
docker compose -f docker-compose.prod.yml build

# 3. Recreate changed containers (brief restart window per service).
#    The API container runs `prisma migrate deploy` on start to apply committed migrations.
echo "🔄 [CI/CD] Recreating updated containers..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 4. Cleanup old dangling images to preserve NVMe disk space
echo "🧹 [CI/CD] Pruning unused image cache..."
docker image prune -f

echo "✅ [CI/CD] Production deployment completed successfully!"
