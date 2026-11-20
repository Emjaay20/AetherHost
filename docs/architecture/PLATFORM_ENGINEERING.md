# AetherHost Platform Engineering Architecture & Team Core Standard

This document details the architectural design of the AetherHost Core Platform subsystem (`crates/`), designed as an internal platform foundation for multi-tenant cloud operations and developer velocity.

---

## 1. High-Performance Fine-Grained Authorization Engine (`aether-authz`)

### Overview & Mission
In high-throughput multi-tenant architectures, querying the persistence layer (PostgreSQL) for every authorization check degrades p99 tail latency and creates database contention. `aether-authz` provides an **in-memory policy engine with sub-microsecond cached evaluation** (`189.28 ns` median in `crates/aether-authz/benches/authz_bench.rs`, `authz_policy_evaluation/cached_evaluation`; `1.168 µs` median uncached in `authz_policy_evaluation/uncached_evaluation`), combining Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC).

### Key Architectural Characteristics
- **Default-Closed Security Model**: If no registered policy grants access, evaluation defaults to `Deny`.
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
- **Axum & Actix-Web Library Middleware**: Middleware adapters for Axum (`telemetry_middleware`, used by `aether-router` and `aether-logd`) and Actix-Web (`ActixTelemetryMiddleware` in `crates/aether-telemetry/src/actix.rs`, demonstrated in `crates/aether-authz/examples/actix_monolith.rs`) that bind trace spans and metric records to request lifecycles.

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

| Benchmark Target | Operation / Scenario | Criterion Benchmark (`file :: group/function`) | Measured Median Latency | Throughput / Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| `aether-authz` | **Cached policy evaluation** | `crates/aether-authz/benches/authz_bench.rs :: authz_policy_evaluation/cached_evaluation` | **189.28 ns** (< 0.2 µs) | **5.28M ops/sec** (Sub-microsecond cached lookup) |
| `aether-authz` | **Uncached policy evaluation** | `crates/aether-authz/benches/authz_bench.rs :: authz_policy_evaluation/uncached_evaluation` | **1.168 µs** | **856K ops/sec** (Full RBAC/ABAC rule evaluation) |
| `aether-authz` | **Cache invalidation (tenant)** | `crates/aether-authz/benches/authz_bench.rs :: authz_cache_invalidation/invalidate_tenant` | **3.030 µs** | Granular partition retain across 1,000 entries |
| `aether-authz` | **Cache invalidation (subject)** | `crates/aether-authz/benches/authz_bench.rs :: authz_cache_invalidation/invalidate_subject` | **2.473 µs** | Granular key retain across 1,000 entries |
| `aether-authz` | **Cache invalidation (resource)** | `crates/aether-authz/benches/authz_bench.rs :: authz_cache_invalidation/invalidate_resource` | **2.444 µs** | Granular resource retain across 1,000 entries |
| `aether-telemetry` | **Single-thread request record** | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/record_request_single_thread` | **245.59 ns** | Atomic counter + histogram bucket update |
| `aether-telemetry` | **In-flight gauge update** | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/in_flight_gauge_inc_dec` | **3.93 ns** | `AtomicI64` fetch_add / fetch_sub |
| `aether-telemetry` | **Prometheus text rendering** | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/render_prometheus` | **2.468 µs** | Full exposition format generation |
| `aether-telemetry` | **Concurrent recording (4 threads)** | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_contention/concurrent_record_request_4_threads` | **209.63 ns** | High-contention parallel recording |

### Architectural Reality & Transparency
- **Concurrency**: Fast-path metrics (gauges and histogram bucket counters) use atomic primitives (`AtomicU64`, `AtomicI64`) with `Ordering::Relaxed`. Route indexing and cache lookup utilize read-write locks (`std::sync::RwLock`) for concurrent read evaluation.
- **Memory & Cache Eviction**: `EvaluationCache` (`crates/aether-authz/src/cache.rs`) stores owned string fields in `CacheKey` (`subject_id`, `tenant_id`, `resource_kind`, `resource_id`) inside an `Arc<RwLock<HashMap<CacheKey, CachedEntry>>>` with a per-entry TTL (`expires_at`) and a `max_capacity` bound (default `10,000`, pre-allocating up to `max_capacity.min(4096)`). It is **not** LRU: when `map.len() >= self.max_capacity` on `insert()`, it calls `map.clear()` to remove all cached entries before inserting the new entry.

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
