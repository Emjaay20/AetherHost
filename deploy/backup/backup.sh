#!/usr/bin/env bash
# Encrypted, off-host backup for AetherHost. Requires restic, rclone and a
# root-owned /etc/aetherhost/backup.env. It intentionally excludes Docker
# images and build cache: they are reproducible and waste backup capacity.
set -euo pipefail

readonly platform_dir="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly projects_dir="${PROJECTS_ROOT:-/srv/aetherhost/projects}"
readonly config_file="/etc/aetherhost/backup.env"
# Restic chooses an incremental parent based on the source path. A random
# mktemp path made every scheduled backup look unrelated to its predecessor,
# forcing full scans. This fixed, root-owned path preserves that relationship.
readonly work_dir="/var/lib/aetherhost/backup-staging"
readonly restic_cache_dir="${RESTIC_CACHE_DIR:-/var/cache/aetherhost/restic}"

cleanup() {
  # Never accept a configurable deletion target. Only clear children of the
  # dedicated staging directory after checking its exact canonical location.
  [[ "$work_dir" == "/var/lib/aetherhost/backup-staging" && -d "$work_dir" ]] || return 0
  find "$work_dir" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
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

if [[ ! -f "$platform_dir/docker-compose.prod.yml" ]] || [[ ! -d "$projects_dir" ]]; then
  echo "Missing AetherHost control-plane or projects directory. Run the layout migration first." >&2
  exit 1
fi
install -d -m 0700 "$restic_cache_dir" "$work_dir"
cleanup
export HOME="${HOME:-/root}"
export XDG_CACHE_HOME="$restic_cache_dir"

# Google Drive is a valid backup target. Concurrency and rate limiting are tuned
# to prevent Google Drive API 429 quota errors while allowing efficient throughput.
readonly rclone_tpslimit="${RCLONE_TPSLIMIT:-4}"
readonly rclone_tpslimit_burst="${RCLONE_TPSLIMIT_BURST:-4}"
readonly rclone_transfers="${RCLONE_TRANSFERS:-4}"
readonly rclone_checkers="${RCLONE_CHECKERS:-4}"
readonly rclone_args="${RCLONE_RESTIC_ARGS:-serve restic --stdio --b2-hard-delete --transfers ${rclone_transfers} --checkers ${rclone_checkers} --tpslimit ${rclone_tpslimit} --tpslimit-burst ${rclone_tpslimit_burst} --retries 8}"
readonly rclone_timeout="${RCLONE_TIMEOUT:-5m}"

restic_run() {
  restic -o "rclone.args=${rclone_args}" -o "rclone.timeout=${rclone_timeout}" "$@"
}

retry_restic() {
  local attempt=1
  local max_attempts="${RESTIC_MAX_ATTEMPTS:-3}"
  until restic_run "$@"; do
    if (( attempt >= max_attempts )); then
      return 1
    fi
    local delay=$(( attempt * 30 ))
    echo "Restic command failed; retrying in ${delay}s (attempt $((attempt + 1))/${max_attempts})..." >&2
    sleep "$delay"
    ((attempt++))
  done
}

mkdir -p "$work_dir/volumes"

if docker ps --format '{{.Names}}' | grep -qx 'aetherhost-postgres'; then
  set -a
  source "$platform_dir/.env"
  set +a
  docker exec -e "PGPASSWORD=${POSTGRES_PASSWORD}" aetherhost-postgres \
    pg_dump --clean --if-exists --no-owner -U "${POSTGRES_USER:-aether}" "${POSTGRES_DB:-aetherhost}" \
    > "$work_dir/control-plane-postgres.sql"
fi

# Tenant and platform data volumes only. Backed up directly as uncompressed directory trees
# so Restic content-defined chunking (CDC) deduplicates blocks across backups instead of
# uploading redundant, changing gzip archives.
while IFS= read -r volume; do
  [[ -z "$volume" ]] && continue
  mkdir -p "$work_dir/volumes/${volume}"
  if [[ -d "/var/lib/docker/volumes/${volume}/_data" ]]; then
    rsync -a --delete "/var/lib/docker/volumes/${volume}/_data/" "$work_dir/volumes/${volume}/"
  fi
done < <(docker volume ls --format '{{.Name}}' | grep -E '^aetherhost([-_]|$)' || true)

# Configuration and tenant source are included uncompressed; Git metadata and local
# build/dependency caches are omitted.
mkdir -p "$work_dir/control-plane"
cp "$platform_dir/.env" "$platform_dir/docker-compose.prod.yml" "$work_dir/control-plane/" 2>/dev/null || true
if [[ -d "$platform_dir/deploy" ]]; then
  rsync -a --delete --exclude='.git' "$platform_dir/deploy" "$work_dir/control-plane/"
fi

mkdir -p "$work_dir/projects"
if [[ -d "$projects_dir" ]]; then
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='*/target' \
    --exclude='target' \
    "$projects_dir/" "$work_dir/projects/"
fi

if ! restic_run cat config >/dev/null 2>&1; then
  echo "Initializing new restic repository at ${RESTIC_REPOSITORY}..."
  restic_run init
fi

retry_restic backup --tag aetherhost --tag production "$work_dir"

if [[ "${RESTIC_ENABLE_PRUNE:-false}" == "true" ]]; then
  retry_restic forget --prune \
    --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
    --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
    --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}"
fi

echo "AetherHost backup completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
