#!/usr/bin/env bash
# Non-destructive recovery drill. Restores the latest backup into a temporary
# directory, checks repository integrity, and verifies the control-plane dump.
set -euo pipefail

readonly config_file="/etc/aetherhost/backup.env"
readonly platform_dir="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly started_at="$(date +%s)"
readonly target_dir="$(mktemp -d /var/tmp/aetherhost-restore-check.XXXXXX)"
readonly restic_cache_dir="${RESTIC_CACHE_DIR:-/var/cache/aetherhost/restic}"

cleanup() {
  if [[ -n "${sandbox:-}" ]]; then docker rm -f -v "$sandbox" >/dev/null 2>&1 || true; fi
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
install -d -m 0700 "$restic_cache_dir"
export XDG_CACHE_HOME="$restic_cache_dir"

readonly rclone_tpslimit="${RCLONE_TPSLIMIT:-4}"
readonly rclone_tpslimit_burst="${RCLONE_TPSLIMIT_BURST:-4}"
readonly rclone_transfers="${RCLONE_TRANSFERS:-4}"
readonly rclone_checkers="${RCLONE_CHECKERS:-4}"
readonly rclone_args="${RCLONE_RESTIC_ARGS:-serve restic --stdio --b2-hard-delete --transfers ${rclone_transfers} --checkers ${rclone_checkers} --tpslimit ${rclone_tpslimit} --tpslimit-burst ${rclone_tpslimit_burst} --retries 8}"
readonly rclone_timeout="${RCLONE_TIMEOUT:-5m}"

restic_run() {
  restic -o "rclone.args=${rclone_args}" -o "rclone.timeout=${rclone_timeout}" "$@"
}

restic_run check --read-data-subset=5%
restic_run snapshots --latest 1 --tag aetherhost,production --json > "$target_dir/snapshot.json"
snapshot_id="$(python3 - "$target_dir/snapshot.json" "${RESTORE_MAX_SNAPSHOT_AGE_SECONDS:-86400}" <<'PYTHON'
import datetime, json, sys
rows = json.load(open(sys.argv[1]))
if len(rows) != 1:
    raise SystemExit('Expected exactly one platform snapshot')
row = rows[0]
stamp = datetime.datetime.fromisoformat(row['time'].replace('Z', '+00:00'))
age = (datetime.datetime.now(datetime.timezone.utc) - stamp).total_seconds()
if age < -300 or age > int(sys.argv[2]):
    raise SystemExit('Snapshot outside recovery-point objective')
print(row['id'])
PYTHON
)"
restic_run restore "$snapshot_id" --target "$target_dir" --include "*control-plane-postgres.sql*"

dump_file="$(find "$target_dir" -name control-plane-postgres.sql -type f -print -quit)"
if [[ -z "$dump_file" ]] || [[ ! -s "$dump_file" ]]; then
  echo "Restore drill failed: PostgreSQL dump was not recovered." >&2
  exit 1
fi

# Restore into a disposable PostgreSQL instance with no network or host mounts.
# Require an operator-approved immutable image; no unverified mutable tag fallback.
: "${RESTORE_POSTGRES_IMAGE:?Set an approved postgres image@sha256:digest in backup.env}"
[[ "$RESTORE_POSTGRES_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]] || exit 2
sandbox="aether-restore-$(date +%s)-$$"
docker run -d --name "$sandbox" --network none --cap-drop ALL \
  --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges:true --memory 512m --cpus 1 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=aether_restore \
  "$RESTORE_POSTGRES_IMAGE" >/dev/null
ready=false
for attempt in {1..30}; do
  if docker exec "$sandbox" pg_isready -U postgres -d aether_restore >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Recovery database did not start' >&2; exit 1; }
# SQL output and errors may contain customer data. Keep details in the protected
# temporary directory and emit only a generic failure to operational logs.
if ! docker exec -i "$sandbox" psql -X -v ON_ERROR_STOP=1 -U postgres -d aether_restore \
  < "$dump_file" > "$target_dir/restore.log" 2>&1; then
  echo 'PostgreSQL restore failed; no data values emitted' >&2
  exit 1
fi
result="$(docker exec "$sandbox" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d aether_restore -c \
  'SELECT count(*) FROM "Application" a LEFT JOIN "Tenant" t ON t.id = a."tenantId" WHERE t.id IS NULL;')"
[[ "$result" == 0 ]] || { echo 'Recovered database has orphaned tenant applications' >&2; exit 1; }
# Table queries must execute successfully; counts are not printed.
docker exec "$sandbox" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d aether_restore \
  -c 'SELECT count(*) FROM "Tenant"; SELECT count(*) FROM "Application"; SELECT count(*) FROM "AuditLog";' >/dev/null
printf '{"drill":"postgresql-restore","status":"passed","elapsed_seconds":%s,"verified_at":"%s","scope":"database restore and relational checks; not full platform RTO"}\n' \
 "$(( $(date +%s) - started_at ))" "$(date -u +%FT%TZ)"
