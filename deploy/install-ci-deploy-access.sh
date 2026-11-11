#!/usr/bin/env bash
# Installs the narrowly scoped sudo rule used by the existing CI SSH account.
# It does not change SSH settings, root login, or any tenant application.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

readonly control_plane_root="${CONTROL_PLANE_ROOT:-/srv/aetherhost/control}"
readonly source_file="${control_plane_root}/deploy/sudoers/aetherhost-deploy"
readonly target_file="/etc/sudoers.d/aetherhost-deploy"

if ! id engineer >/dev/null 2>&1; then
  echo "Expected deployment account 'engineer' does not exist." >&2
  exit 1
fi
if [[ ! -r "$source_file" ]]; then
  echo "Missing $source_file" >&2
  exit 1
fi

install -o root -g root -m 0440 "$source_file" "$target_file"
visudo -cf "$target_file"
echo "Installed restricted CI deployment permission for engineer."
