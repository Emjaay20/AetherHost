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
- **Evaluation Cache & Cache Invalidation**: Thread-safe in-memory cache with configurable TTL and zero-allocation hash keys. Supports targeted invalidation:
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
- **Lock-Free / Atomic Prometheus Metrics**:
  - `http_requests_total`: Counter tagged with `service`, `method`, `route`, and `status`.
  - `http_requests_in_flight`: Concurrency gauge tracking active requests.
  - `http_request_duration_seconds`: High-resolution latency histograms with standard web latency buckets (0.005s to 10.0s).
- **Axum Middleware**: Zero-boilerplate middleware (`telemetry_middleware`) that automatically binds trace spans and metric records to request lifecycles.

---

## 3. Resilient Shared Kernel (`aether-core`)

### Overview & Mission
Eliminates ad-hoc error handling and unhandled cascading failures by providing resilient systems abstractions.

### Key Architectural Characteristics
- **Typed Error Domain Hierarchy (`PlatformError`)**: Built with `thiserror`. Provides clean error categories (`Config`, `Network`, `CircuitOpen`, `Unauthenticated`, `Forbidden`, `RateLimitExceeded`, `Timeout`).
- **Circuit Breaker (`CircuitBreaker`)**: Concurrency-safe Michael Nygard pattern.
  - State machine: `Closed` &rarr; `Open` (tripped upon reaching threshold) &rarr; `HalfOpen` (probing after recovery timeout).
  - Fast-fails downstream requests when upstream dependencies experience outages, preventing thread pool exhaustion.
- **Fail-Fast Configuration Validation (`validate_secret`, `validate_port`)**: Evaluates configuration safety at boot time, blocking insecure defaults or missing credentials before network listeners bind.

---

## 4. Developer Experience & AI Platform Tooling (`aether-cli`)

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

## 5. Strict CI/CD Quality Gates (`.github/workflows/ci.yml`)

The platform pipeline enforces:
1. `dtolnay/rust-toolchain` with `clippy` and `rustfmt`.
2. `Swatinem/rust-cache` caching `crates -> target` across pull requests.
3. `cargo clippy --workspace --all-targets -- -D warnings` preventing code quality debt.
4. Comprehensive workspace unit tests and doc tests across all crates.
