#!/usr/bin/env bash
# Installs additive operational timers. Existing applications and routing are
# not recreated or restarted by this script.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

readonly control_plane_root="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly source_dir="${control_plane_root}/deploy/systemd"
readonly target_dir="/etc/systemd/system"

install -m 0644 "$source_dir/aetherhost-backup.service" "$target_dir/aetherhost-backup.service"
install -m 0644 "$source_dir/aetherhost-backup.timer" "$target_dir/aetherhost-backup.timer"
install -m 0644 "$source_dir/aetherhost-restore-check.service" "$target_dir/aetherhost-restore-check.service"
install -m 0644 "$source_dir/aetherhost-restore-check.timer" "$target_dir/aetherhost-restore-check.timer"
install -m 0644 "$source_dir/aetherhost-docker-maintenance.service" "$target_dir/aetherhost-docker-maintenance.service"
install -m 0644 "$source_dir/aetherhost-docker-maintenance.timer" "$target_dir/aetherhost-docker-maintenance.timer"
install -m 0644 "$source_dir/aetherhost-operation-alert@.service" "$target_dir/aetherhost-operation-alert@.service"

chmod 0750 "${control_plane_root}/deploy/backup/backup.sh" "${control_plane_root}/deploy/backup/restore-check.sh" "${control_plane_root}/deploy/notify-operation-failure.sh"
systemctl daemon-reload
systemctl enable --now aetherhost-docker-maintenance.timer
if [[ -r /etc/aetherhost/backup.env ]]; then
  systemctl enable --now aetherhost-backup.timer aetherhost-restore-check.timer
else
  echo "Backup timers deferred: configure /etc/aetherhost/backup.env first."
fi
systemctl list-timers --all 'aetherhost-*'
