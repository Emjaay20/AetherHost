#!/usr/bin/env bash
# Opt-in installation after provisioning a reviewed Trivy binary.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as administrator' >&2; exit 1; }
command -v trivy >/dev/null
command -v docker >/dev/null
root=/srv/aetherhost/control
install -d -m 0700 /var/lib/aetherhost/security
install -m 0644 "$root/deploy/systemd/aetherhost-fleet-scan.service" /etc/systemd/system/
install -m 0644 "$root/deploy/systemd/aetherhost-fleet-scan.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aetherhost-fleet-scan.timer
systemctl start aetherhost-fleet-scan.service
