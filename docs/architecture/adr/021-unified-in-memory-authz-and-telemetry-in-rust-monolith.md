# ADR 021: Unified In-Memory Authorization (RBAC/ABAC) and RED Telemetry for Platform Services

## Status
Accepted

## Context
As AetherHost scales towards multi-tenant workload orchestration, authorization checks (verifying whether a subject can read, mutate, or deploy an application) and observability instrumentation (W3C tracing, Prometheus metrics) were previously ad-hoc or delegated to downstream database queries.

In a high-throughput monolith or edge proxy:
1. Querying PostgreSQL or a remote Policy Decision Point (PDP like external OPA) on every HTTP request adds significant network latency (5–15ms) and creates database connection exhaustion.
2. Different services (`aether-router`, `aether-logd`, API monolith) used disparate observability patterns, making cross-boundary trace correlation difficult.
3. Feature teams required a declarative, ergonomic interface to define and enforce permissions without deep expertise in security mechanics.

## Decision
We implemented a unified Core Platform subsystem in Rust (`crates/aether-authz` and `crates/aether-telemetry`) adhering to the following design:

1. **In-Memory Policy Engine (`aether-authz`)**:
   - **Evaluation Model**: Default-closed hybrid RBAC/ABAC engine supporting role inheritance hierarchies (`admin` &rarr; `developer` &rarr; `viewer`) and fine-grained condition evaluation (`SameTenant`, `ResourceOwner`).
   - **Empirical Performance**: Backed by Criterion micro-benchmarks demonstrating **~189 ns** cached evaluation (< 0.2 µs) and **~1.17 µs** uncached evaluation.
   - **Concurrency & Memory Trade-off**: Chose thread-safe `RwLock<HashMap<CacheKey, CachedEntry>>` with atomic counters over unsafe lock-free primitives to maintain memory safety while achieving over 5.2M evaluations/sec on a single core. Bounded string keys prevent unbounded heap fragmentation.
   - **Structured Audit Trail**: Emits nanosecond-resolution `AuditRecord` entries capturing decision, reason, and policy attribution to an in-memory or tracing sink.

2. **Framework Agnostic Middleware Architecture**:
   - Built zero-boilerplate middleware for both **Actix-Web** (`AuthzMiddleware`, `ActixTelemetryMiddleware`) and **Axum** (`telemetry_middleware`).
   - Provided the `AuthenticatedSubject` extractor implementing `actix_web::FromRequest` to give product engineers instant access to validated actor credentials without boilerplate parsing.

3. **Standardized W3C Distributed Tracing & RED Observability (`aether-telemetry`)**:
   - Enforces W3C `traceparent` (`00-<trace_id>-<parent_id>-01`) propagation across edge reverse proxies and internal services.
   - Standardizes Prometheus RED metrics (`http_requests_total`, `http_requests_in_flight`, `http_request_duration_seconds`) with standard latency buckets.

## Consequences

### Positive
- **Sub-Microsecond Latency**: Authorization is resolved locally in memory, removing database overhead from critical request paths.
- **Strict Tenant Boundary Enforcement**: Edge router (`aether-router`) and log daemon (`aether-logd`) reject unauthorized cross-tenant requests with 403 Forbidden before application origin code executes.
- **Exceptional Developer Experience (DX)**: Feature teams in the Actix-Web monolith can secure any route in 2 lines of code using middleware and extractors.
- **Transparent Multi-Service Observability**: Traces correlate seamlessly in Honeycomb, Jaeger, and Prometheus.

### Negative / Trade-offs
- **In-Memory Cache Invalidation Coordination**: When tenant roles or permissions change, cache invalidation must be triggered (`invalidate_tenant`, `invalidate_subject`). In multi-replica deployments, invalidation events must be broadcast over Redis/pubsub.
