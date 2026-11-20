#!/usr/bin/env bash
# A real CNI enforcement test, restricted to the disposable CI Kind context.
set -euo pipefail
[[ "$(kubectl config current-context)" == kind-aether-kind ]] || { echo 'Refusing non-CI Kubernetes context' >&2; exit 2; }
: "${CI_IDENTITY_TOKEN:?CI identity required}"
platform=deployment/aether-platform-platform
allowed_backend=http://api.aether-system.svc.cluster.local:3000
blocked_backend=http://api-blocked.aether-system.svc.cluster.local:3000
router=http://aether-platform-platform.aether-system.svc.cluster.local:8080
auth_scheme=Bearer
authorization="Authorization: ${auth_scheme} ${CI_IDENTITY_TOKEN}"
restore_backend() {
  kubectl set env "$platform" -n aether-system --containers=aether-router DEFAULT_BACKEND="$allowed_backend" >/dev/null 2>&1 || true
}
trap restore_backend EXIT

for namespace in ingress-system denied-network-test; do
  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -
  kubectl label namespace "$namespace" pod-security.kubernetes.io/enforce=restricted --overwrite
  kubectl apply -n "$namespace" -f scripts/security/fixtures/network-probe.yaml
done
kubectl apply -n aether-system -f scripts/security/fixtures/network-backends.yaml
kubectl wait --for=condition=Ready pod/network-probe -n ingress-system --timeout=120s
kubectl wait --for=condition=Ready pod/network-probe -n denied-network-test --timeout=120s
kubectl wait --for=condition=Ready pod/allowed-policy-backend -n aether-system --timeout=120s
kubectl wait --for=condition=Ready pod/blocked-policy-backend -n aether-system --timeout=120s

# Positive control proves DNS, the probe image, target endpoint, and permitted ingress work.
kubectl exec -n ingress-system network-probe -- curl -fsS --connect-timeout 3 --max-time 10 "$router/_aether/health"
# A deny must be an actual connection timeout, not a missing executable, DNS failure, or malformed command.
set +e
kubectl exec -n denied-network-test network-probe -- curl -fsS --connect-timeout 3 --max-time 5 "$router/_aether/health" >/dev/null 2>&1
denied_status=$?
set -e
[[ "$denied_status" -eq 28 ]] || { echo "Expected ingress timeout (28), observed $denied_status" >&2; exit 1; }
echo 'NETWORK_POLICY ingress: permitted namespace passed; untrusted namespace timed out'

# Both backends are reachable outside the platform policy; denial below cannot be
# attributed to a missing backend, an unready pod, or a broken Service.
kubectl exec -n ingress-system network-probe -- curl -fsS --max-time 10 "$allowed_backend/policy-proof"
kubectl exec -n ingress-system network-probe -- curl -fsS --max-time 10 "$blocked_backend/policy-proof"
kubectl set env "$platform" -n aether-system --containers=aether-router DEFAULT_BACKEND="$allowed_backend"
kubectl rollout status "$platform" -n aether-system --timeout=120s
kubectl exec -n ingress-system network-probe -- curl -fsS --max-time 40 -H "$authorization" -H 'Host: network-probe.aetherhost.internal' "$router/policy-proof" | grep -q 'network-policy-proof'
echo 'NETWORK_POLICY egress: selected backend reachable through authenticated router'

kubectl set env "$platform" -n aether-system --containers=aether-router DEFAULT_BACKEND="$blocked_backend"
kubectl rollout status "$platform" -n aether-system --timeout=120s
started="$(date +%s)"
response="$(kubectl exec -n ingress-system network-probe -- curl -sS --connect-timeout 3 --max-time 45 -w '\n%{http_code}' -H "$authorization" -H 'Host: network-probe.aetherhost.internal' "$router/policy-proof")"
status="${response##*$'\n'}"
[[ "$status" == 502 ]] || { echo "Expected router upstream failure (502), observed $status" >&2; exit 1; }
# Connection refusal or DNS failure is fast; require the configured upstream timeout.
elapsed=$(( $(date +%s) - started ))
[[ "$elapsed" -ge 20 ]] || { echo 'Upstream failed before the expected policy timeout' >&2; exit 1; }
echo 'NETWORK_POLICY egress: unselected but healthy backend blocked with a policy timeout'
