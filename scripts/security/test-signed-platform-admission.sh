#!/usr/bin/env bash
set -euo pipefail

digest="${PLATFORM_DIGEST:?PLATFORM_DIGEST must be the published digest}"
revision="${GITHUB_SHA:?GITHUB_SHA must be the published revision}"
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
image="ghcr.io/emjaay20/aether-platform@$digest"
tagged="ghcr.io/emjaay20/aether-platform:$revision"
fixture='deploy/policies/kyverno/tests/signed-platform-pod.yaml'
temp_dir="$(mktemp -d)"
trap 'rm -f "$temp_dir/result"; rmdir "$temp_dir"' EXIT

echo 'Checking admission of the just-published signed digest.'
sed "s|__PLATFORM_IMAGE__|$image|g" "$fixture" | kubectl create -f -

echo 'Checking that the same release is rejected when specified by tag.'
if sed -e "s|__PLATFORM_IMAGE__|$tagged|g" -e 's/name: signed-platform-admission/name: tag-only-platform-admission/' "$fixture" | kubectl create --dry-run=server -f - >"$temp_dir/result" 2>&1; then
  echo 'A tag-only platform image was unexpectedly admitted.' >&2
  exit 1
fi
if ! grep -Eq 'aether-workload-security|verify-image-signature' "$temp_dir/result"; then
  cat "$temp_dir/result" >&2
  echo 'Tag-only image was rejected for a reason unrelated to the policies.' >&2
  exit 1
fi
echo 'Signed digest admitted; tag-only reference denied.'
