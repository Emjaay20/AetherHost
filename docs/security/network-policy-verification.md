# Network policy verification

The CI Kind cluster disables its default CNI and installs pinned Cilium 1.18.17,
which lists Kubernetes 1.31 in its supported compatibility matrix:
https://github.com/cilium/cilium/blob/v1.18.17/Documentation/network/kubernetes/compatibility.rst

A policy manifest and schema validation alone cannot establish packet filtering.
The new CI step exercises both positive controls and actual rejected traffic:

1. A restricted probe in the selected ingress namespace reaches router health.
2. The same probe image in an unselected namespace must time out with curl code 28.
   DNS/command failures do not count as a successful denial.
3. Two healthy backend services are verified reachable outside the platform policy.
4. An authenticated router request reaches the policy-selected backend.
5. Repointing the isolated router to the healthy but unselected backend must
   produce an upstream timeout and HTTP 502 after the configured timeout window.
   An immediate connection refusal or DNS error does not count.

The test refuses any Kubernetes context except the disposable `kind-aether-kind`
context. Fixtures have restricted pod settings, bounded resources, no host mounts,
no persistent data, no service-account token mounting, and synthetic credentials.
The router backend setting is restored when the test exits.

A passing result establishes enforcement in that CI cluster, not in an unrelated
production cluster. Retain the actual CI job result; do not infer a pass from this
document. The VPS deployment remains separate from this Kubernetes demonstration.
