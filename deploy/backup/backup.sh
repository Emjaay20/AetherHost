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

# Google Drive is a valid backup target. Rate limiting is applied to the rclone
# process which Restic launches, preventing the request bursts that previously
# exhausted the Drive API quota. Operators can tune these safely in backup.env.
readonly rclone_args="${RCLONE_RESTIC_ARGS:-serve restic --stdio --b2-hard-delete --transfers 1 --checkers 1 --tpslimit 2 --tpslimit-burst 2 --retries 8}"
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
    local delay=$(( attempt * 60 ))
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
  -czf "$work_dir/control-plane-config-and-source.tgz" \
  -C "$platform_dir" .env docker-compose.prod.yml deploy

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='*/target' \
  -czf "$work_dir/project-source.tgz" \
  -C "$projects_dir" .

if ! restic_run cat config >/dev/null 2>&1; then
  echo "Initializing new restic repository at ${RESTIC_REPOSITORY}..."
  restic_run init
fi

retry_restic backup --tag aetherhost --tag production "$work_dir"
retry_restic forget --prune \
  --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}"

echo "AetherHost backup completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
