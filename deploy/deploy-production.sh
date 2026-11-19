#!/usr/bin/env bash
# Root-owned entry point. The sole argument is a validated, approved commit SHA.
set -euo pipefail
revision="${1:?approved source revision required}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ $EUID -eq 0 ]] || { echo 'Root entry point required' >&2; exit 1; }
install -d -o root -g root -m 0755 /run/lock/aetherhost
exec 9>/run/lock/aetherhost/production-deploy.lock
flock -n 9 || { echo 'Deployment already running' >&2; exit 1; }
cd /srv/aetherhost/control
# First-release bootstrap: this source tree may still contain the verified
# deploy entry point copied in before main carries it. Only that exact, root
# owned helper is permitted to clear this one-file transition; every other
# local change remains a hard failure.
bootstrap_helper=/usr/local/lib/aetherhost/deploy-production-bootstrap.sh
changes="$(git status --porcelain --untracked-files=all)"
if [[ -n "$changes" && "$changes" == " M deploy/deploy-production.sh" && -x "$bootstrap_helper" ]] && \
  cmp -s deploy/deploy-production.sh "$bootstrap_helper"; then
  git restore --source=HEAD -- deploy/deploy-production.sh
  exec "$bootstrap_helper" "$revision"
fi
[[ -z "$changes" ]] || { echo 'Checkout drift; refusing release' >&2; exit 1; }
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$revision" ]] || { echo 'Release is no longer current main' >&2; exit 1; }
git merge --ff-only "$revision"
[[ "$(git rev-parse HEAD)" == "$revision" ]]
export AETHER_API_IMAGE AETHER_DASHBOARD_IMAGE AETHER_AGENT_IMAGE
AETHER_API_IMAGE="$(bash deploy/verify-image.sh ghcr.io/emjaay20/aetherhost-api "$revision")"
AETHER_DASHBOARD_IMAGE="$(bash deploy/verify-image.sh ghcr.io/emjaay20/aetherhost-dashboard "$revision")"
AETHER_AGENT_IMAGE="$(bash deploy/verify-image.sh ghcr.io/emjaay20/aetherhost-agent "$revision")"
# Validate dedicated vault configuration before replacing a healthy running API.
# This isolated entry point loads no application modules and makes no DB calls.
docker compose -p aetherhost -f docker-compose.prod.yml config --quiet
docker compose -p aetherhost -f docker-compose.prod.yml run --rm --no-deps --entrypoint node api \
  -e 'new (require("/app/apps/api/dist/common/crypto/secret-vault.service.js").SecretVaultService)()'
# Exercise the same migration command and generated Prisma client that the API
# will use at startup before replacing the healthy service.
docker compose -p aetherhost -f docker-compose.prod.yml run --rm --no-deps --entrypoint sh api \
  -c 'cd apps/api && ./node_modules/.bin/prisma migrate deploy && node -e "require(\"@prisma/client\")"'
# Compose reads production secrets from the host .env. New key configuration is mandatory.
docker compose -p aetherhost -f docker-compose.prod.yml up -d --no-build --remove-orphans api dashboard agent traefik docker-socket-proxy-readonly
bash deploy/install-operations-timers.sh
bash deploy/install-security-timers.sh
healthy=false
for attempt in {1..30}; do
  if docker exec aetherhost-api wget -q --spider http://127.0.0.1:3000/v1/ready && \
     docker exec aetherhost-dashboard wget -q --spider http://127.0.0.1:3000/docs; then
    healthy=true
    break
  fi
  sleep 2
done
[[ "$healthy" == true ]] || { echo 'Release failed readiness checks' >&2; exit 1; }
# Persist only public immutable image references after the replacement is
# healthy. A failed candidate therefore cannot become the operator default.
install -d -m 0750 /etc/aetherhost
release_file="$(mktemp /etc/aetherhost/release.XXXXXX)"
trap 'rm -f "$release_file"' EXIT
printf 'AETHER_API_IMAGE=%s\nAETHER_DASHBOARD_IMAGE=%s\nAETHER_AGENT_IMAGE=%s\n' \
  "$AETHER_API_IMAGE" "$AETHER_DASHBOARD_IMAGE" "$AETHER_AGENT_IMAGE" > "$release_file"
chmod 0640 "$release_file"
mv "$release_file" /etc/aetherhost/release.env
# Public metadata only. Fleet scanner consumes these exact deployed digests.
printf '{"revision":"%s","api":"%s","dashboard":"%s","agent":"%s","verified_at":"%s"}\n' \
 "$revision" "$AETHER_API_IMAGE" "$AETHER_DASHBOARD_IMAGE" "$AETHER_AGENT_IMAGE" "$(date -u +%FT%TZ)" > /etc/aetherhost/release.json
echo "Verified release deployed: $revision"
