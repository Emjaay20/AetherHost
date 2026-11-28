#!/usr/bin/env bash
set -euo pipefail

fixture='deploy/policies/kyverno/tests/resources.yaml'
temp_dir="$(mktemp -d)"
trap 'rm -f "$temp_dir/result"; rmdir "$temp_dir"' EXIT

resource() {
  awk -v name="$1" 'BEGIN { RS="---" } $0 ~ "name: " name "([,}\n ]|$)" { print; found=1 } END { if (!found) exit 1 }' "$fixture"
}

kubectl create namespace test-workload --dry-run=client -o yaml | kubectl apply -f -
resource good | kubectl apply --dry-run=server -f -
for name in latest root root-override privileged no-limits default-ns; do
  if resource "$name" | kubectl apply --dry-run=server -f - >"$temp_dir/result" 2>&1; then
    echo "Admission unexpectedly accepted $name" >&2
    exit 1
  fi
  if ! grep -q 'aether-workload-security' "$temp_dir/result"; then
    cat "$temp_dir/result" >&2
    echo "Rejection was not caused by the workload policy: $name" >&2
    exit 1
  fi
  echo "Admission rejected $name as expected."
done

if kubectl apply --dry-run=server -f deploy/policies/kyverno/tests/unverified-platform.yaml >"$temp_dir/result" 2>&1; then
  echo 'Admission unexpectedly accepted an unverified platform image' >&2
  exit 1
fi
if ! grep -q 'verify-image-signature' "$temp_dir/result"; then
  cat "$temp_dir/result" >&2
  echo 'Unverified image was not rejected by the signature policy' >&2
  exit 1
fi
echo 'Admission rejected an unverified platform digest.'

# This is an admission-only structural chart check. The synthetic registry
# deliberately does not match the signature policy; image trust is separate.
helm template test-release deploy/helm/aether-platform --namespace test-workload \
  --set image.repository=example.org/demo \
  --set image.digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --set autoscaling.enabled=false |
  kubectl apply -n test-workload --dry-run=server -f -
