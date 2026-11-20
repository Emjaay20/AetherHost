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
authorization="Authorization: $auth_scheme $CI_IDENTITY_TOKEN"

restore_backend() {
  kubectl set env "$platform" -n aether-system --containers=aether-router DEFAULT_BACKEND="$allowed_backend" >/dev/null 2>&1 || true
}
trap restore_backend EXIT

set_backend() {
  local target="$1" current previous pod
  current="$(kubectl get "$platform" -n aether-system -o jsonpath='{.spec.template.spec.containers[?(@.name=="aether-router")].env[?(@.name=="DEFAULT_BACKEND")].value}')"
  if [[ "$current" == "$target" ]]; then
    kubectl rollout status "$platform" -n aether-system --timeout=120s
    return
  fi
  previous="$(kubectl get pods -n aether-system -l app.kubernetes.io/instance=aether-platform -o name)"
  kubectl set env "$platform" -n aether-system --containers=aether-router DEFAULT_BACKEND="$target"
  kubectl rollout status "$platform" -n aether-system --timeout=120s
  # Rollout completion can precede old-pod termination and endpoint convergence.
  for pod in $previous; do
    kubectl wait --for=delete "$pod" -n aether-system --timeout=90s
  done
}

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

kubectl exec -n ingress-system network-probe -- curl -fsS --connect-timeout 3 --max-time 10 "$router/_aether/health"
set +e
kubectl exec -n denied-network-test network-probe -- curl -fsS --connect-timeout 3 --max-time 5 "$router/_aether/health" >/dev/null 2>&1
denied_status=$?
set -e
[[ "$denied_status" -eq 28 ]] || { echo "Expected ingress timeout (28), observed $denied_status" >&2; exit 1; }
echo 'NETWORK_POLICY ingress: permitted namespace passed; untrusted namespace timed out'

# Both backends are healthy outside the platform policy.
kubectl exec -n ingress-system network-probe -- curl -fsS --max-time 10 "$allowed_backend/policy-proof"
kubectl exec -n ingress-system network-probe -- curl -fsS --max-time 10 "$blocked_backend/policy-proof"
set_backend "$allowed_backend"
allowed=false
for attempt in {1..3}; do
  reply="$(kubectl exec -n ingress-system network-probe -- curl -sS --max-time 40 -w '\n%{http_code}' -H "$authorization" -H 'Host: network-probe.aetherhost.internal' "$router/policy-proof")"
  code="$(printf '%s' "$reply" | tail -n 1)"
  if [[ "$code" == 200 ]] && printf '%s' "$reply" | grep -q 'network-policy-proof'; then
    allowed=true
    break
  fi
  printf 'Allowed-backend attempt %s returned %s: %.500s\n' "$attempt" "$code" "$reply" >&2
  sleep 2
done
[[ "$allowed" == true ]] || { kubectl logs "$platform" -n aether-system -c aether-router --tail=40; exit 1; }
echo 'NETWORK_POLICY egress: selected backend reachable through authenticated router'

set_backend "$blocked_backend"
started="$(date +%s)"
reply="$(kubectl exec -n ingress-system network-probe -- curl -sS --connect-timeout 3 --max-time 45 -w '\n%{http_code}' -H "$authorization" -H 'Host: network-probe.aetherhost.internal' "$router/policy-proof")"
code="$(printf '%s' "$reply" | tail -n 1)"
[[ "$code" == 502 ]] || { echo "Expected router upstream failure (502), observed $code" >&2; exit 1; }
elapsed=$(( $(date +%s) - started ))
[[ "$elapsed" -ge 20 ]] || { echo 'Upstream failed before the expected policy timeout' >&2; exit 1; }
echo 'NETWORK_POLICY egress: unselected but healthy backend blocked with a policy timeout'
