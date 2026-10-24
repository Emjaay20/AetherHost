#!/usr/bin/env bash
# Encrypted, off-host backup for AetherHost. Requires restic, rclone and a
# root-owned /etc/aetherhost/backup.env. It intentionally excludes Docker
# images and build cache: they are reproducible and waste backup capacity.
set -euo pipefail

readonly platform_dir="/opt/aetherhost"
readonly config_file="/etc/aetherhost/backup.env"
readonly work_dir="$(mktemp -d /var/tmp/aetherhost-backup.XXXXXX)"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

if [[ $EUID -ne 0 ]]; then
  echo "Run this backup as root." >&2
  exit 1
fi
if [[ ! -r "$config_file" ]]; then
  echo "Missing $config_file. Follow deploy/backup/GOOGLE_DRIVE_SETUP.md first." >&2
  exit 1
fi

# This file is root-owned and mode 600; it is never committed to Git.
set -a
source "$config_file"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

mkdir -p "$work_dir/volumes"

if docker ps --format '{{.Names}}' | grep -qx 'aetherhost-postgres'; then
  set -a
  source "$platform_dir/.env"
  set +a
  docker exec -e "PGPASSWORD=${POSTGRES_PASSWORD}" aetherhost-postgres \
    pg_dump --clean --if-exists --no-owner -U "${POSTGRES_USER:-aether}" "${POSTGRES_DB:-aetherhost}" \
    > "$work_dir/control-plane-postgres.sql"
fi

# Tenant and platform data volumes only. BuildKit state, images and caches are
# deliberately excluded because they are reproducible and can become huge.
while IFS= read -r volume; do
  [[ -z "$volume" ]] && continue
  docker run --rm \
    -v "${volume}:/source:ro" \
    -v "${work_dir}/volumes:/backup" \
    alpine:3.20 sh -c "tar -C /source -czf /backup/${volume}.tgz ."
done < <(docker volume ls --format '{{.Name}}' | grep -E '^aetherhost([-_]|$)' || true)

# Configuration and tenant source are included, but Git metadata and local
# dependency directories are omitted because source is reproducible from Git.
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='deployments/*/target' \
  -czf "$work_dir/platform-config-and-source.tgz" \
  -C "$platform_dir" .env docker-compose.prod.yml deployments deploy

if ! restic cat config >/dev/null 2>&1; then
  echo "Initializing new restic repository at ${RESTIC_REPOSITORY}..."
  restic init
fi

restic backup --tag aetherhost --tag production "$work_dir"
restic forget --prune \
  --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}"

echo "AetherHost backup completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
