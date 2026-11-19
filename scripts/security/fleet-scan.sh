#!/usr/bin/env bash
# Scan the actual deployed digests. Never print docker inspect environment variables.
set -euo pipefail
report_dir="${1:?report output directory required}"
command -v trivy >/dev/null
install -d -m 0700 "$report_dir"
status=0
for service in api dashboard agent; do
  image="$(docker inspect "aetherhost-$service" --format '{{.Config.Image}}')"
  [[ "$image" =~ ^ghcr\.io/emjaay20/aetherhost-(api|dashboard|agent)@sha256:[a-f0-9]{64}$ ]] || { echo "Non-immutable image for $service" >&2; exit 1; }
  printf '%s\n' "$image" > "$report_dir/$service.image"
  trivy image --format json --output "$report_dir/$service.json" --severity HIGH,CRITICAL \
    --ignorefile .trivyignore --exit-code 1 "$image" || status=1
 done
exit "$status"
