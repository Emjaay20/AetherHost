#!/usr/bin/env bash
# Local evidence runner: fail on failure, never convert missing tools into passed controls.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
python3 scripts/security/check-policy.py
python3 -m unittest discover -s scripts/security -p 'test_*.py'
pnpm --filter @aetherhost/api test --runInBand
(cd apps/agent-go && go vet ./... && go test ./...)
cargo clippy --workspace --all-targets --manifest-path crates/Cargo.toml -- -D warnings
cargo test --workspace --manifest-path crates/Cargo.toml
pnpm --filter dashboard exec tsc --noEmit
pnpm --filter dashboard test
if [[ "${1:-}" == '--infrastructure' ]]; then
  command -v helm >/dev/null
  command -v terraform >/dev/null
  helm lint deploy/helm/aether-platform --set image.requireDigest=false
  terraform -chdir=terraform init -backend=false
  terraform -chdir=terraform validate
  terraform -chdir=terraform/aws-security-lab init -backend=false
  terraform -chdir=terraform/aws-security-lab validate
else
  echo 'Infrastructure/runtime execution not requested; no deployment or recovery result claimed.'
fi
echo 'Requested local checks passed. Live infrastructure controls require separate observed evidence.'
