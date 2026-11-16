# AetherHost Platform Engineering Architecture & Team Core Standard

This document details the architectural design of the AetherHost Core Platform subsystem (`crates/`), designed as an internal platform foundation for multi-tenant cloud operations and developer velocity.

---

## 1. High-Performance Fine-Grained Authorization Engine (`aether-authz`)

### Overview & Mission
In high-throughput multi-tenant architectures, querying the persistence layer (PostgreSQL) for every authorization check degrades p99 tail latency and creates database contention. `aether-authz` provides a **sub-microsecond in-memory policy engine** combining Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC).

### Key Architectural Characteristics
- **Default-Closed Security Model**: If no registered policy grants access, evaluation strictly defaults to `Deny`.
- **Role Inheritance Hierarchy**: Supports multi-level role expansion (e.g. `Admin` inherits `Editor`, which inherits `Viewer`).
- **Granular ABAC Conditions**:
  - `SameTenant`: Validates strict isolation between subject tenant and target resource tenant.
  - `ResourceOwner`: Enables self-service resource management (e.g. users modifying their own deployments).
  - `AttributeEquals`: Enables environment fencing (e.g. denying destructive actions on `environment: production`).
- **Evaluation Cache & Cache Invalidation**: Thread-safe in-memory cache with configurable TTL and granular invalidation. Supports targeted invalidation:
  - `invalidate_tenant(tenant_id)`
  - `invalidate_subject(subject_id)`
  - `invalidate_resource(resource_id)`
- **Audit Sink**: Every decision emits an `AuditRecord` capturing latency in nanoseconds, policy attribution, and allow/deny rationale.

```rust
// Ergonomic usage pattern:
let ctx = EvaluationContext::new(subject, resource, Action::Read);
check_permission!(&engine, &ctx);
```

---

## 2. Universal Telemetry & RED Observability Layer (`aether-telemetry`)

### Overview & Mission
Provides high-cardinality distributed tracing and standardized Prometheus RED (Rate, Errors, Duration) metrics across all services.

### Key Architectural Characteristics
- **W3C Distributed Trace Context**: Standard `traceparent` parsing, formatting, and HTTP header propagation (`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`) compliant with OpenTelemetry collectors, Honeycomb, and Jaeger.
- **Thread-Safe Atomic Prometheus Metrics**:
  - `http_requests_total`: Counter tagged with `service`, `method`, `route`, and `status`.
  - `http_requests_in_flight`: Concurrency gauge tracking active requests via atomic fetch_add/fetch_sub.
  - `http_request_duration_seconds`: High-resolution latency histograms with standard web latency buckets (0.005s to 10.0s).
- **Axum & Actix-Web Middleware**: Standardized middleware (`telemetry_middleware` and `TelemetryMiddleware`) that automatically binds trace spans and metric records to request lifecycles.

---

## 3. Empirical Performance Benchmarks (Criterion)

All performance claims are empirically verified using Criterion micro-benchmarks under `crates/aether-authz/benches` and `crates/aether-telemetry/benches`.

**Benchmark Command**:
```bash
cargo bench --workspace --manifest-path crates/Cargo.toml
```

**Environment**:
- **Hardware**: Apple Silicon (Darwin aarch64)
- **Compiler**: `rustc 1.82.0+` (release profile, opt-level = 3)
- **Benchmarking Framework**: Criterion 0.5 with 100 samples per measurement

### Measured Results

| Benchmark Target | Operation / Scenario | Measured Median Latency | Throughput / Characteristics |
| :--- | :--- | :--- | :--- |
| `aether-authz` | **Cached policy evaluation** | **189.28 ns** (< 0.2 µs) | **5.28M ops/sec** (Strictly sub-microsecond) |
| `aether-authz` | **Uncached policy evaluation** | **1.168 µs** | **856K ops/sec** (Full RBAC/ABAC rule evaluation) |
| `aether-authz` | **Cache invalidation (tenant)** | **3.030 µs** | Granular partition retain across 1,000 entries |
| `aether-authz` | **Cache invalidation (subject)** | **2.473 µs** | Granular key retain across 1,000 entries |
| `aether-authz` | **Cache invalidation (resource)** | **2.444 µs** | Granular resource retain across 1,000 entries |
| `aether-telemetry` | **Single-thread request record** | **245.59 ns** | Atomic counter + histogram bucket update |
| `aether-telemetry` | **In-flight gauge update** | **3.93 ns** | Lock-free `AtomicI64` fetch_add / fetch_sub |
| `aether-telemetry` | **Prometheus text rendering** | **2.468 µs** | Full exposition format generation |
| `aether-telemetry` | **Concurrent recording (4 threads)**| **209.63 ns** | High-contention parallel recording |

### Architectural Reality & Transparency
- **Concurrency**: Fast-path metrics (gauges and histogram bucket counters) use atomic primitives (`AtomicU64`, `AtomicI64`) with `Ordering::Relaxed`. Route indexing and cache lookup utilize fine-grained read-write locks (`std::sync::RwLock`) for concurrent parallel read evaluation.
- **Memory**: Cache keys and contexts allocate small bounded strings (`Subject.id`, `Tenant.id`, `Resource.id`) for multi-tenant isolation safety, with in-memory footprint bounded by configurable LRU capacity. Unbounded heap allocations are strictly prevented.

---

## 4. Resilient Shared Kernel (`aether-core`)

### Overview & Mission
Eliminates ad-hoc error handling and unhandled cascading failures by providing resilient systems abstractions.

### Key Architectural Characteristics
- **Typed Error Domain Hierarchy (`PlatformError`)**: Built with `thiserror`. Provides clean error categories (`Config`, `Network`, `CircuitOpen`, `Unauthenticated`, `Forbidden`, `RateLimitExceeded`, `Timeout`).
- **Circuit Breaker (`CircuitBreaker`)**: Concurrency-safe Michael Nygard pattern.
  - State machine: `Closed` &rarr; `Open` (tripped upon reaching threshold) &rarr; `HalfOpen` (probing after recovery timeout).
  - Fast-fails downstream requests when upstream dependencies experience outages, preventing thread pool exhaustion.
- **Fail-Fast Configuration Validation (`validate_secret`, `validate_port`)**: Evaluates configuration safety at boot time, blocking insecure defaults or missing credentials before network listeners bind.

---

## 5. Developer Experience & AI Platform Tooling (`aether-cli`)

### `aether doctor`
Provides a 1-click diagnostic tool evaluating local developer environments:
- Rust toolchain and compiler presence.
- Docker Engine daemon socket connectivity.
- Git SCM presence.
- API Control Plane network reachability and latency.

### `aether mcp` (Model Context Protocol Server)
Enables autonomous AI coding agents (Claude Code, Cursor, Copilot, Antigravity) to operate safely:
- Runs a standard JSON-RPC 2.0 stdio server.
- Exposes typed tools to agents:
  - `get_platform_info`: Introspects supported runtimes, ports, and conventions.
  - `validate_manifest`: Verifies application names, runtimes, and boundaries before code generation.
  - `evaluate_policy`: Allows agents to test and verify RBAC/ABAC authorization rules programmatically.

---

## 6. Strict CI/CD Quality Gates (`.github/workflows/ci.yml`)

The platform pipeline enforces:
1. `dtolnay/rust-toolchain` with `clippy` and `rustfmt`.
2. `Swatinem/rust-cache` caching `crates -> target` across pull requests.
3. `cargo clippy --workspace --all-targets -- -D warnings` preventing code quality debt.
4. Comprehensive workspace unit tests and doc tests across all crates.
5. Supply-chain security checks with `cargo-deny` (licenses, bans, security advisories).

---

## 7. Production Deployment Reality & Kubernetes GitOps Path

To maintain engineering transparency between current runtime operations and cloud scalability:
- **Production Environment**: Currently operates on a dedicated, hardened Contabo VPS orchestrated via Docker Compose and automated systemd timers (encrypted off-host restic backups, non-destructive restore drills, Docker cache pruning). Continuous deployment is executed via the `deploy` job in `.github/workflows/ci.yml` over secure SSH (see [docs/CONTABO_DEPLOYMENT.md](../CONTABO_DEPLOYMENT.md) and [docs/OPERATIONS.md](../OPERATIONS.md)).
- **Kubernetes & GitOps Path**: The Helm chart (`deploy/helm/aether-platform`) and Flux GitOps declarations (`deploy/gitops/`) are fully maintained platform assets. They are **continuously validated in CI** using an ephemeral KinD (Kubernetes-in-Docker) cluster, strict schema verification via `kubeconform`, container image builds from `crates/Dockerfile`, Helm release installation, and automated health/metrics endpoint smoke tests. This ensures the platform is pre-validated for managed Kubernetes (EKS/GKE/AKS/K3s) deployment without operational surprises.
