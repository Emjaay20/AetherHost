#!/usr/bin/env bash
# Move AetherHost to a layout where platform code and tenant projects cannot
# overwrite one another. This script is additive: it copies data and does not
# stop containers, remove the legacy directory, or delete tenant files.
set -euo pipefail

readonly legacy_root="${LEGACY_ROOT:-/opt/aetherhost}"
readonly source_root="${SOURCE_ROOT:-/opt/aetherhost-release-2ec3d0f}"
readonly control_plane_root="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly projects_root="${PROJECTS_ROOT:-/srv/aetherhost/projects}"
readonly agent_uid="${AGENT_UID:-1001}"
readonly agent_gid="${AGENT_GID:-1001}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this migration as root." >&2
  exit 1
fi
if [[ ! -f "$source_root/docker-compose.prod.yml" ]]; then
  echo "Source checkout is missing docker-compose.prod.yml: $source_root" >&2
  exit 1
fi
if [[ ! -r "$legacy_root/.env" ]]; then
  echo "Legacy AetherHost environment file is missing: $legacy_root/.env" >&2
  exit 1
fi
if [[ -e "$control_plane_root" ]] && [[ -n "$(find "$control_plane_root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to merge into a non-empty control-plane directory: $control_plane_root" >&2
  exit 1
fi

install -d -m 0755 -o root -g root "$control_plane_root" "$projects_root"

# Do not use --delete. The legacy directory remains untouched as a recovery
# reference until a successful backup and restore drill have been recorded.
rsync -a \
  --exclude='.env' \
  --exclude='deployments' \
  --exclude='node_modules' \
  --exclude='.next' \
  "$source_root/" "$control_plane_root/"
install -d -m 0755 -o root -g root "$control_plane_root/deployments"
install -m 0600 -o root -g root "$legacy_root/.env" "$control_plane_root/.env"

if [[ -d "$legacy_root/deployments" ]]; then
  rsync -a "$legacy_root/deployments/" "$projects_root/"
fi
chown -R "$agent_uid:$agent_gid" "$projects_root"

set_config() {
  local key="$1" value="$2" env_file="$control_plane_root/.env"
  if grep -qE "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}
set_config CONTROL_PLANE_ROOT "$control_plane_root"
set_config PROJECTS_ROOT "$projects_root"

chmod 0750 "$control_plane_root/deploy/backup/backup.sh" "$control_plane_root/deploy/backup/restore-check.sh"

echo "AetherHost control plane copied to: $control_plane_root"
echo "Tenant project workspaces copied to: $projects_root"
echo "No containers were restarted and nothing was removed."
echo "Next: deploy the updated agent from $control_plane_root, then run the backup service and restore drill."
