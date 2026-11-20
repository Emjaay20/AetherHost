# ADR 021: Unified In-Memory Authorization (RBAC/ABAC) and RED Telemetry for Platform Services

## Status
Accepted

## Context
As AetherHost scales multi-tenant workload orchestration, authorization checks (verifying whether a subject can read, mutate, or stream logs for an application) and observability instrumentation (W3C tracing, Prometheus metrics) need a consistent, low-latency foundation across Rust platform services.

In high-throughput platform services (`aether-router` and `aether-logd`):
1. Querying PostgreSQL or a remote Policy Decision Point (PDP such as an external OPA service) on every HTTP request adds network latency (5–15ms) and risks database connection contention.
2. Different Rust services (`aether-router`, `aether-logd`) needed shared authorization and observability primitives to keep cross-boundary trace correlation and tenant isolation consistent.
3. Platform engineers needed a reusable library interface to define and enforce permissions in Rust services (both the running Axum daemons and reusable Actix-Web middleware adapters) without duplicating policy evaluation or credential-resolution logic.

## Decision
We implemented a unified Core Platform subsystem in Rust (`crates/aether-authz` and `crates/aether-telemetry`) adhering to the following design:

1. **In-Memory Policy Engine (`aether-authz`)**:
   - **Evaluation Model**: Default-closed hybrid RBAC/ABAC engine supporting role inheritance hierarchies (`admin` &rarr; `developer` &rarr; `viewer`) and fine-grained condition evaluation (`SameTenant`, `ResourceOwner`, `AttributeEquals`).
   - **Empirical Performance**: Backed by Criterion micro-benchmarks in `crates/aether-authz/benches/authz_bench.rs` demonstrating **189.28 ns** median sub-microsecond cached evaluation (`authz_policy_evaluation/cached_evaluation`, < 0.2 µs) and **1.168 µs** median uncached evaluation (`authz_policy_evaluation/uncached_evaluation`).
   - **Concurrency & Cache Design**: Uses a thread-safe `RwLock<HashMap<CacheKey, CachedEntry>>` in `crates/aether-authz/src/cache.rs` with per-entry TTL expiration and simple capacity-bound eviction (`map.clear()` when `map.len() >= max_capacity`; it is not LRU), achieving 5.28M cached evaluations/sec on a single core in `crates/aether-authz/benches/authz_bench.rs` (`authz_policy_evaluation/cached_evaluation`).
   - **Structured Audit Trail**: Emits nanosecond-resolution `AuditRecord` entries capturing decision, reason, and policy attribution to an in-memory or tracing sink.

2. **Framework Middleware & Extractor Library APIs**:
   - Built middleware adapters for **Axum** (`telemetry_middleware`, used in `crates/aether-router` and `crates/aether-logd`) and library middleware for **Actix-Web** (`AuthzMiddleware` in `crates/aether-authz/src/actix.rs` and `ActixTelemetryMiddleware` in `crates/aether-telemetry/src/actix.rs`).
   - Provided the `AuthenticatedSubject` extractor implementing `actix_web::FromRequest` (`crates/aether-authz/src/actix.rs`) as a library API for authenticating callers against a server-owned `IdentityRegistry`. Because the control-plane API (`apps/api`) is a NestJS service and no production Actix-Web service runs in this repository, the Actix-Web middleware and extractor are validated via integration tests (`crates/aether-authz/tests/actix_integration.rs`) and the standalone example app (`crates/aether-authz/examples/actix_monolith.rs`).

3. **Standardized W3C Distributed Tracing & RED Observability (`aether-telemetry`)**:
   - Enforces W3C `traceparent` (`00-<trace_id>-<parent_id>-01`) propagation across `aether-router`, `aether-logd`, and the Actix-Web middleware adapter.
   - Standardizes Prometheus RED metrics (`http_requests_total`, `http_requests_in_flight`, `http_request_duration_seconds`) with standard latency buckets, benchmarked in `crates/aether-telemetry/benches/telemetry_bench.rs`.

## Consequences

### Positive
- **Sub-Microsecond Cached Evaluation Latency**: Cached authorization checks resolve locally in memory in **189.28 ns** median (`crates/aether-authz/benches/authz_bench.rs`, `authz_policy_evaluation/cached_evaluation`; uncached evaluation **1.168 µs** in `authz_policy_evaluation/uncached_evaluation`), keeping database queries off the request path.
- **Tenant Boundary Enforcement in Rust Daemons**: Edge router (`aether-router`) and log daemon (`aether-logd`) reject unauthorized cross-tenant requests with `403 Forbidden` before upstream forwarding or log streaming.
- **Reusable Actix-Web Library API**: The `AuthzMiddleware`, `ActixTelemetryMiddleware`, and `AuthenticatedSubject` library components provide a tested integration surface (demonstrated in `crates/aether-authz/examples/actix_monolith.rs`) that can be adopted by future Actix-Web services without custom header-parsing boilerplate.
- **Consistent Multi-Service Observability**: W3C trace context and Prometheus RED metrics follow a single schema across Rust platform components.

### Negative / Trade-offs
- **In-Memory Cache Invalidation Coordination**: When tenant roles or permissions change, cache invalidation must be triggered (`invalidate_tenant`, `invalidate_subject`, `invalidate_resource`). In multi-replica deployments, cross-pod invalidation requires an external pub/sub fan-out mechanism (such as Redis Pub/Sub) rather than relying solely on local TTL expiry.
