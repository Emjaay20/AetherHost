# AetherHost Kubernetes & GitOps Architecture

This document formalizes the deployment architecture, scaling strategy, and GitOps lifecycle for AetherHost across single-node edge instances and distributed Kubernetes clusters.

---

## 1. Architectural Decision Record (ADR 004): Single-Node Compose vs. Multi-Node Kubernetes

### Context
AetherHost serves two primary execution models:
1. **Tier-1 Edge / Control Plane (Current Production - `194.163.172.101`)**: Single-tenant or compact multi-tenant orchestrator running on hardened bare-metal / VPS compute.
2. **Tier-2 Distributed Engine (`deploy/helm`, `deploy/gitops`), design only and not deployed**: a multi-node workload executor intended for managed Kubernetes (EKS, GKE) or k3s. The chart is validated in CI on a throwaway KinD cluster; no long-running cluster runs it.

### Decision
- **Production Edge Nodes**: Run hardened **Docker Compose** (`docker-compose.prod.yml`). This eliminates Kubernetes control plane memory overhead (~1.5GB to 2GB RAM), avoids etcd quorum latency across single nodes, and keeps the blast radius minimal using Linux namespaces, `read_only: true`, `cap_drop: [ALL]`, and the read-only Docker socket proxy.
- **Enterprise / Scaled Workloads**: Deploy via **Flux v2 GitOps** and the **Helm Chart** (`deploy/helm/aether-platform`). All cluster manifests are strictly version-controlled, declarative, and enforced with Kubernetes Pod Security Standards (`restricted`).

### Rationale & Trade-offs
| Dimension | Docker Compose (Current Production) | Kubernetes + Flux v2 (Enterprise Roadmap) |
| :--- | :--- | :--- |
| **Compute Overhead** | Minimal (< 100MB daemon footprint) | Moderate (etcd, kubelet, coredns, CNI ~ 1.5GB) |
| **Recovery Time (MTTR)** | Rapid local daemon restart; 5m restore check | Node failover in 30-60s via scheduler |
| **Scaling Horizon** | Vertical (up to 64 cores / 256GB RAM) | Horizontal (HPA 3 to 15+ replicas across nodes) |
| **Security Envelope** | Linux capabilities, cgroups v2, socket proxy | PSS `restricted`, NetworkPolicies, PodDisruptionBudgets |
| **Deployment Model** | Pushed via SSH least-privilege script from CI | Pulled via GitOps reconciliation loops (Flux) |

---

## 2. Helm Chart Architecture (`deploy/helm/aether-platform`)

The production chart packages the core edge platform components (`aether-router` and `aether-logd`):

```
deploy/helm/aether-platform/
├── Chart.yaml                  # Chart metadata (v0.1.0)
├── values.yaml                 # Defaults, resource limits, security context
└── templates/
    ├── deployment.yaml         # Non-root pod spec with hardened securityContext
    ├── service.yaml            # ClusterIP service definitions
    ├── ingress.yaml            # Traefik IngressRoute with TLS termination
    ├── hpa.yaml                # Horizontal Pod Autoscaler (75% CPU / 80% RAM)
    ├── pdb.yaml                # PodDisruptionBudget (minAvailable: 2)
    └── servicemonitor.yaml     # Prometheus Operator telemetry endpoint
```

### Pod Security Standard (`restricted`)
All pods deployed by this chart adhere strictly to Kubernetes `restricted` security profiles:
- `readOnlyRootFilesystem: true`
- `runAsNonRoot: true`
- `runAsUser: 10001`
- `allowPrivilegeEscalation: false`
- `capabilities.drop: ["ALL"]`
- `seccompProfile.type: RuntimeDefault`

---

## 3. GitOps Continuous Delivery (`deploy/gitops`)

AetherHost adopts the GitOps methodology using **Flux v2** for declarative cluster reconciliation:

```mermaid
flowchart LR
    GitRepo["Git Repository\n(main branch)"] -->|Poll 1m| SourceController["Flux Source Controller\n(GitRepository)"]
    SourceController -->|Notify| HelmController["Flux Helm Controller\n(HelmRelease)"]
    SourceController -->|Reconcile| KustomizeController["Flux Kustomize Controller"]
    HelmController -->|Deploy / Upgrade| K8sCluster["Kubernetes Cluster\n(namespace: aether-system)"]
    K8sCluster -->|Enforce| PSS["Pod Security Standard\n(restricted)"]
```

### GitOps Manifests
- **[namespace.yaml](../deploy/gitops/namespace.yaml)**: Enforces namespace-level restricted PSS and audit logging.
- **[gitrepository.yaml](../deploy/gitops/gitrepository.yaml)**: Configures Git sync targeting `deploy/helm/aether-platform` and `deploy/gitops`.
- **[helmrelease.yaml](../deploy/gitops/helmrelease.yaml)**: Automates canary rollouts, auto-rollback on failure (`remediation.retries: 3`), and sets replica limits.
- **[kustomization.yaml](../deploy/gitops/kustomization.yaml)**: Reconciles all Kubernetes resources every 10 minutes with state pruning.

---

## 4. Operational Runbook

### Validating Helm Chart Locally
```bash
# Lint the chart against Kubernetes best practices
helm lint deploy/helm/aether-platform

# Render templates with default values
helm template aether-platform deploy/helm/aether-platform --namespace aether-system
```

### Bootstrapping Flux v2 onto a Cluster
```bash
# 1. Install Flux CLI
curl -s https://fluxcd.io/install.sh | sudo bash

# 2. Check cluster prerequisites
flux check --pre

# 3. Bootstrap repository
flux bootstrap github \
  --owner=Emjaay20 \
  --repository=AetherHost \
  --branch=main \
  --path=deploy/gitops \
  --personal
```
