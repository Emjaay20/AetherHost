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

require_api_image_revision() {
  local expected_revision actual_revision attempt
  expected_revision="$(git rev-parse HEAD)"

  # Image publication runs independently from this host deployment. A mutable
  # `latest` tag can otherwise still point at the previous commit when this
  # script pulls it, resulting in a healthy-but-stale API release.
  for attempt in {1..30}; do
    echo "📦 [CI/CD] Pulling API image for ${expected_revision:0:12} (attempt ${attempt}/30)..."
    docker compose -p aetherhost -f docker-compose.prod.yml pull api
    actual_revision="$(docker image inspect ghcr.io/emjaay20/aetherhost-api:latest \
      --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"

    if [[ "$actual_revision" == "$expected_revision" ]]; then
      echo "✅ [CI/CD] Verified API image revision ${actual_revision:0:12}"
      return 0
    fi

    echo "⏳ [CI/CD] Registry image is ${actual_revision:0:12}, awaiting ${expected_revision:0:12}."
    sleep 10
  done

  echo "❌ [CI/CD] Refusing to deploy a stale API image after waiting for ${expected_revision:0:12}." >&2
  return 1
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

# 2.5 Ensure Docker daemon accepts API v1.24+ for reverse proxy discovery compatibility
if [[ ! -f /etc/systemd/system/docker.service.d/min_api_version.conf ]]; then
  echo "🔧 [CI/CD] Configuring Docker daemon minimum API version compatibility (1.24)..."
  mkdir -p /etc/systemd/system/docker.service.d
  cat <<'EOF' > /etc/systemd/system/docker.service.d/min_api_version.conf
[Service]
Environment="DOCKER_MIN_API_VERSION=1.24"
EOF
  systemctl daemon-reload
  systemctl restart docker
  sleep 3
fi

# 3. Pull the prebuilt API image and verify it matches the checked-out commit.
# The dashboard is intentionally built on the host because its public runtime
# configuration is injected there.
require_api_image_revision

echo "🔨 [CI/CD] Building dashboard container with host secrets..."
docker compose -p aetherhost -f docker-compose.prod.yml build dashboard

# 4. Recreate changed containers (brief restart window per service).
#    The API container runs `prisma migrate deploy` on start to apply committed migrations.
echo "🔄 [CI/CD] Recreating updated containers..."
docker compose -p aetherhost -f docker-compose.prod.yml up -d --remove-orphans --force-recreate dashboard api traefik docker-socket-proxy-readonly

# 5. Install operational units without mutating tracked source files.
"${control_plane_root}/deploy/install-operations-timers.sh"

# 6. Verify container runtime and edge proxy health
echo "📋 [CI/CD] Container runtime status:"
docker compose -p aetherhost -f docker-compose.prod.yml ps

echo "🔍 [CI/CD] Verifying edge routing..."
for i in {1..15}; do
  if curl -sf -k -H "Host: api.aetherhost.app" https://127.0.0.1/v1/health >/dev/null 2>&1 || docker exec aetherhost-api wget -q --spider http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
    echo "✅ API healthy"
    break
  fi
  echo "Waiting for API readiness... ($i/15)"
  sleep 2
done

for i in {1..15}; do
  if curl -sf -k -H "Host: aetherhost.app" https://127.0.0.1/docs >/dev/null 2>&1; then
    echo "✅ Traefik edge routing verified for aetherhost.app/docs"
    break
  fi
  echo "Waiting for Traefik route discovery... ($i/15)"
  sleep 2
done

echo "Traefik recent logs:"
docker logs --tail 30 aetherhost-traefik || true

echo "Docker Socket Proxy Readonly recent logs:"
docker logs --tail 30 aetherhost-docker-proxy-readonly || true

# 7. Cleanup old dangling images to preserve NVMe disk space
echo "🧹 [CI/CD] Pruning unused image cache..."
docker image prune -f

echo "✅ [CI/CD] Production deployment completed successfully!"
