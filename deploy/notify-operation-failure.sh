#!/usr/bin/env bash
# Sends a short, value-free alert when a scheduled AetherHost operation fails.
# The webhook is root-owned at /etc/aetherhost/operations.env and is never
# printed or copied into application logs.
set -euo pipefail

readonly config_file="/etc/aetherhost/operations.env"
readonly unit_name="${1:-aetherhost-operation}"

if [[ ! "$unit_name" =~ ^[A-Za-z0-9@._:-]+$ ]]; then
  echo "Refusing an invalid systemd unit name." >&2
  exit 0
fi

if [[ ! -r "$config_file" ]]; then
  echo "AetherHost operation failed (${unit_name}), but Slack is not configured." >&2
  exit 0
fi

set -a
source "$config_file"
set +a
webhook_url="${SLACK_WEBHOOK_URL:-}"
if [[ -z "$webhook_url" ]]; then
  echo "AetherHost operation failed (${unit_name}), but SLACK_WEBHOOK_URL is empty." >&2
  exit 0
fi

payload=$(printf '{"text":"🚨 AetherHost scheduled operation failed: %s. Check systemctl status and journalctl on the production host."}' "$unit_name")
if ! curl --fail --silent --show-error --max-time 15 \
  -X POST -H 'Content-Type: application/json' --data "$payload" "$webhook_url"; then
  echo "AetherHost failure alert could not be delivered for ${unit_name}." >&2
fi
