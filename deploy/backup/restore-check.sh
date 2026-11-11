#!/usr/bin/env bash
# Non-destructive recovery drill. Restores the latest backup into a temporary
# directory, checks repository integrity, and verifies the control-plane dump.
set -euo pipefail

readonly config_file="/etc/aetherhost/backup.env"
readonly platform_dir="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly target_dir="$(mktemp -d /var/tmp/aetherhost-restore-check.XXXXXX)"

cleanup() {
  rm -rf "$target_dir"
}
trap cleanup EXIT

if [[ $EUID -ne 0 ]]; then
  echo "Run this restore check as root." >&2
  exit 1
fi
if [[ ! -r "$config_file" ]]; then
  echo "Missing $config_file. Backups are not configured." >&2
  exit 1
fi

set -a
source "$config_file"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

readonly rclone_args="${RCLONE_RESTIC_ARGS:-serve restic --stdio --b2-hard-delete --transfers 1 --checkers 1 --tpslimit 2 --tpslimit-burst 2 --retries 8}"
readonly rclone_timeout="${RCLONE_TIMEOUT:-5m}"

restic_run() {
  restic -o "rclone.args=${rclone_args}" -o "rclone.timeout=${rclone_timeout}" "$@"
}

restic_run check
restic_run restore latest --target "$target_dir"

dump_file="$(find "$target_dir" -name control-plane-postgres.sql -type f -print -quit)"
if [[ -z "$dump_file" ]] || [[ ! -s "$dump_file" ]]; then
  echo "Restore drill failed: PostgreSQL dump was not recovered." >&2
  exit 1
fi

if ! grep -qE 'CREATE TABLE|INSERT INTO' "$dump_file"; then
  echo "Restore drill failed: PostgreSQL dump does not look valid." >&2
  exit 1
fi

echo "AetherHost restore drill passed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
