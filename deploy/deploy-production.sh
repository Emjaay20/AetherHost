#!/usr/bin/env bash
set -euo pipefail

readonly lock_dir="/run/lock/aetherhost"
install -d -o root -g root -m 0755 "$lock_dir"
exec 9>"${lock_dir}/production-deploy.lock"
if ! flock -n 9; then
  echo "⏭️  [CI/CD] A production deployment is already running; skipping this duplicate trigger."
  exit 0
fi

readonly control_plane_root="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
cd "$control_plane_root"

require_clean_checkout() {
  local changes
  changes="$(git status --porcelain --untracked-files=all)"
  if [[ -n "$changes" ]]; then
    echo "❌ [CI/CD] Refusing to deploy from a modified control-plane checkout." >&2
    echo "Commit or revert the following files before retrying:" >&2
    printf '%s\n' "$changes" >&2
    exit 1
  fi
}

echo "🚀 [CI/CD] Starting automated production deployment..."

# 1. Fail closed if the host source has drifted from version control. This
# prevents a later `docker compose build` from silently deploying unreviewed
# edits that happened directly on the VPS.
require_clean_checkout

# 2. Pull latest code from GitHub, then check again before building it.
echo "📥 [CI/CD] Pulling latest code from origin/main..."
git pull --ff-only origin main
require_clean_checkout

# 3. Build updated images using Docker cache
echo "🏗️ [CI/CD] Building updated container images..."
docker compose -p aetherhost -f docker-compose.prod.yml build

# 4. Recreate changed containers (brief restart window per service).
#    The API container runs `prisma migrate deploy` on start to apply committed migrations.
echo "🔄 [CI/CD] Recreating updated containers..."
docker compose -p aetherhost -f docker-compose.prod.yml up -d --remove-orphans

# 5. Install operational units without mutating tracked source files.
"${control_plane_root}/deploy/install-operations-timers.sh"

# 6. Cleanup old dangling images to preserve NVMe disk space
echo "🧹 [CI/CD] Pruning unused image cache..."
docker image prune -f

echo "✅ [CI/CD] Production deployment completed successfully!"
