#!/usr/bin/env bash
# Resolve a release tag once, verify its digest and signer, and emit only the digest reference.
set -euo pipefail
image="${1:?image repository required}"
revision="${2:?full source revision required}"
[[ "$image" =~ ^ghcr\.io/emjaay20/aether(host-(api|dashboard|agent)|-platform)$ ]] || exit 2
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 2
command -v cosign >/dev/null
command -v docker >/dev/null
docker pull "$image:$revision" >&2
reference="$(docker image inspect "$image:$revision" --format '{{index .RepoDigests 0}}')"
[[ "${reference%@*}" == "$image" && "${reference#*@}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Unexpected image digest' >&2; exit 1; }
cosign verify --certificate-identity-regexp '^https://github\.com/Emjaay20/AetherHost/\.github/workflows/(ci|publish-images)\.yml@refs/heads/main$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' "$reference" >/dev/null
actual="$(docker image inspect "$reference" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "$actual" == "$revision" ]] || { echo 'Image revision mismatch' >&2; exit 1; }
printf '%s\n' "$reference"
