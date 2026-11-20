#!/usr/bin/env bash
# Bound the cache of every standalone BuildKit container on this host.
#
# `docker buildx prune` only reaches the current builder. A BuildKit container
# left behind by another builder keeps its own state volume, and on production
# one grew to 91 GB without the nightly maintenance job ever touching it.
# Build cache is reproducible, so trimming it is always safe.
set -euo pipefail

# buildctl expresses --keep-storage in megabytes.
readonly keep_storage_mb="${BUILDKIT_KEEP_STORAGE_MB:-10000}"

while IFS= read -r container; do
  [[ -z "$container" ]] && continue
  echo "Pruning BuildKit cache in ${container} down to ${keep_storage_mb} MB..."
  docker exec "$container" buildctl prune --keep-storage "$keep_storage_mb" >/dev/null ||
    echo "Could not prune ${container}; continuing." >&2
done < <(docker ps --filter 'name=buildx_buildkit_' --format '{{.Names}}')
