# RFC 001: Proposed Rollout of In-Memory Authorization and Distributed Telemetry for an Actix-Web Service

- **Authors**: Platform Engineering / Team Core
- **Status**: Proposed (Library middleware and example proving ground implemented; production service rollout unexecuted)
- **Target Subsystems**: Edge Proxy (`crates/aether-router`), Log Daemon (`crates/aether-logd`), Actix-Web Example Proving Ground (`crates/aether-authz/examples/actix_monolith.rs`)
- **Reviewers**: Architecture Review Board, Security Engineering, Core Platform Team

---

## 1. Executive Summary & Motivation

Tenant data isolation and low-latency request authorization are core requirements across AetherHost's multi-tenant services. Every workload, log stream, and routed request belongs to an isolated tenant boundary.

Today in this repository:
1. The control-plane API (`apps/api`) is a **NestJS** service; no production Actix-Web service runs in this repository.
2. The Rust platform daemons—`crates/aether-router` and `crates/aether-logd`—are Axum services that enforce tenant authorization in memory via **`aether-authz`** and emit W3C trace context and Prometheus RED metrics via **`aether-telemetry`**.
3. Both crates also provide reusable Actix-Web library middleware (`crates/aether-authz/src/actix.rs` and `crates/aether-telemetry/src/actix.rs`), which are exercised in the example proving-ground binary (`crates/aether-authz/examples/actix_monolith.rs`) and integration test suite (`crates/aether-authz/tests/actix_integration.rs`).

This RFC is a **proposal** describing how **`aether-authz`** (in-memory RBAC/ABAC engine with sub-microsecond cached policy evaluation at 189.28 ns median in `crates/aether-authz/benches/authz_bench.rs`, `authz_policy_evaluation/cached_evaluation`, and 1.168 µs uncached evaluation in `authz_policy_evaluation/uncached_evaluation`) and **`aether-telemetry`** (W3C distributed tracing + Prometheus RED metrics) would be rolled out into a future Actix-Web application service, using `crates/aether-authz/examples/actix_monolith.rs` as the repository proving ground. Unexecuted capabilities (shadow mode, canary routing, and Redis Pub/Sub cache invalidation) are documented below as planned design stages rather than deployed functionality.

---

## 2. Core Architectural Components (Implemented Library vs. Planned Rollout Extensions)

The diagram below shows the Actix-Web middleware stack implemented in `crates/aether-telemetry/src/actix.rs` and `crates/aether-authz/src/actix.rs` (demonstrated in `crates/aether-authz/examples/actix_monolith.rs`), alongside the planned shadow-mode branch proposed for dark-launch rollouts:

```
+-----------------------------------------------------------------------------------+
|                                Client HTTP Request                                |
|                 (Headers: Authorization: Bearer <token>, traceparent)             |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        ActixTelemetryMiddleware (Outer Layer)                     |
|  - Implemented in crates/aether-telemetry/src/actix.rs                            |
|  - Ingests and echoes W3C traceparent (00-<trace_id>-<parent_id>-01)              |
|  - Tracks in-flight request gauge (AtomicI64 fetch_add / fetch_sub)               |
|  - Records request duration and HTTP status into MetricsRegistry                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                          AuthzMiddleware (Inner Layer)                            |
|  - Implemented in crates/aether-authz/src/actix.rs                                |
|  1. Resolve Subject & resource tenant from server-owned IdentityRegistry          |
|     (caller role/tenant headers are ignored)                                      |
|  2. Evaluate policy against in-memory AuthzEngine:                                |
|     - Fast path: Cached in RwLock<HashMap> (~189.28 ns, authz_bench.rs)           |
|     - Slow path: Uncached policy evaluation (~1.168 µs, authz_bench.rs)           |
|  3. Decision Branch:                                                              |
|     ├── [ALLOWED]: Forward to handler (AuthenticatedSubject available)            |
|     └── [DENIED]:                                                                 |
|           ├── Current implementation: Short-circuit with 401/403 JSON             |
|           └── Planned SHADOW_MODE extension: Log violation, increment metric,     |
|               and allow request through during dark-launch validation             |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|          Example Proving-Ground Handler (examples/actix_monolith.rs)              |
|          async fn get_workloads(subject: AuthenticatedSubject)                    |
+-----------------------------------------------------------------------------------+
```

---

## 3. Proposed Four-Phase Rollout Strategy for a Future Actix-Web Service

If an Actix-Web service is introduced alongside `aether-router` and `aether-logd`, Team Core proposes a four-phase rollout to prevent false-positive `403 Forbidden` disruptions:

```
[Phase 0: Planned Dark Launch & Shadow Mode]
         │  (Proposed: evaluate policies, emit metrics/logs, do not block traffic)
         ▼
[Phase 1: Planned Canary Deployment]
         │  (Proposed: enforce on 5% of internal tenant traffic in staging & canary pods)
         ▼
[Phase 2: Planned Scope-by-Scope Opt-in]
         │  (Proposed: wrap individual Actix web::scope domains with AuthzMiddleware)
         ▼
[Phase 3: Planned Global Enforcement & Invalidation Mesh]
            (Proposed: default-closed policy across routes + Redis pub/sub invalidation)
```

### Phase 0: Planned Dark Launch & Shadow Mode
- **Planned Extension**: Add a configurable `shadow_mode: bool` option to `AuthzMiddleware` (currently, `AuthzMiddleware::new(engine)` in `crates/aether-authz/src/actix.rs` always enforces decisions).
- **Proposed Behavior**:
  - Evaluate incoming requests against registered RBAC/ABAC rules.
  - When a request would be denied in shadow mode:
    1. Emit an audit record with `decision: "denied"` and a shadow annotation.
    2. Increment a proposed Prometheus counter `authz_shadow_violations_total{tenant, route, action}`.
    3. Allow the request through to the handler without blocking traffic.
- **Goal**: Detect missing service credentials or misconfigured resource ownership entries in `IdentityRegistry` before enabling enforcement.

### Phase 1: Planned Canary Deployment
- **Planned Configuration**: Enable enforcing mode on a canary subset of pods in staging and internal tenants before broad traffic cutover.
- **Planned Monitoring**: Inspect distributed traces and alert on unexpected increases in authorization denials.

### Phase 2: Planned Scope-by-Scope Domain Opt-in (Proving-Ground Pattern)
- In the existing example proving ground (`crates/aether-authz/examples/actix_monolith.rs`), routes are wired with `IdentityRegistry`, `AuthzMiddleware::new`, `ActixTelemetryMiddleware::new`, and the `AuthenticatedSubject` extractor:
  ```rust
  HttpServer::new(move || {
      App::new()
          .app_data(web::Data::new(identities.clone()))
          .app_data(web::Data::from(metrics.clone()))
          .wrap(AuthzMiddleware::new(engine.clone()))
          .wrap(ActixTelemetryMiddleware::new(metrics.clone()))
          .service(health_check)
          .route("/metrics", web::get().to(actix_prometheus_metrics))
          .service(get_workloads)
  })
  ```
- Handlers extract the verified caller via `AuthenticatedSubject` (`crates/aether-authz/src/actix.rs`):
  ```rust
  #[get("/api/v1/workloads")]
  async fn get_workloads(subject: AuthenticatedSubject) -> impl Responder {
      HttpResponse::Ok().json(serde_json::json!({
          "caller_id": subject.subject.id,
          "tenant_id": subject.subject.tenant_id,
      }))
  }
  ```
- In a future multi-domain Actix-Web service, teams would apply `.wrap(AuthzMiddleware::new(engine.clone()))` per `web::scope` as each route group is onboarded.

### Phase 3: Planned Global Enforcement & Distributed Invalidation Mesh
- **Current In-Process API**: `AuthzEngine` provides in-process invalidation methods (`invalidate_tenant`, `invalidate_subject`, `invalidate_resource`), benchmarked in `crates/aether-authz/benches/authz_bench.rs`.
- **Planned Multi-Replica Extension**: Connect a Redis Pub/Sub subscriber so that when permissions change in the control plane:
  1. The mutating service publishes `{"event": "invalidate_tenant", "tenant_id": "tenant-abc"}` to a Redis channel (`aether:authz:invalidation`).
  2. Subscribed service pods receive the event and invoke `authz_engine.invalidate_tenant("tenant-abc")` on their local cache.

---

## 4. Empirical Performance & Budget

The core library operations are benchmarked using Criterion in `crates/aether-authz/benches/authz_bench.rs` and `crates/aether-telemetry/benches/telemetry_bench.rs`:

| Operation | Criterion Benchmark (`file :: group/function`) | Measured Latency (p50) | Target Budget | Margin |
|---|---|---|---|---|
| Cached Policy Evaluation | `crates/aether-authz/benches/authz_bench.rs :: authz_policy_evaluation/cached_evaluation` | **189.28 ns** | < 1,000 ns (1 µs) | 5.3x faster |
| Uncached Policy Evaluation | `crates/aether-authz/benches/authz_bench.rs :: authz_policy_evaluation/uncached_evaluation` | **1.168 µs** | < 10,000 ns (10 µs) | 8.5x faster |
| In-Flight Gauge Inc/Dec | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/in_flight_gauge_inc_dec` | **3.93 ns** | < 50 ns | 12.7x faster |
| Full Request Telemetry Recording | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/record_request_single_thread` | **245.59 ns** | < 1,000 ns (1 µs) | 4.0x faster |
| 4-Thread Contention Recording | `crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_contention/concurrent_record_request_4_threads` | **209.63 ns** | < 1,000 ns (1 µs) | 4.7x faster |

**Measured Library Overhead**: Combining cached policy evaluation (`189.28 ns` in `crates/aether-authz/benches/authz_bench.rs`, `authz_policy_evaluation/cached_evaluation`) and single-thread request telemetry recording (`245.59 ns` in `crates/aether-telemetry/benches/telemetry_bench.rs`, `telemetry_metrics_single_thread/record_request_single_thread`) yields a sub-microsecond combined in-memory fast path (~435 ns), avoiding per-request database lookups.

---

## 5. Developer Experience (DX) & Tooling in This Repository

The repository includes the following tooling supporting `aether-authz`, `aether-telemetry`, `aether-router`, and `aether-logd`:

1. **AI Agent Tooling (`aether mcp`)**:
   - Engineers using Claude Code, Cursor, or Antigravity can query `crates/aether-cli` over JSON-RPC 2.0 `stdio`:
   - Tool `evaluate_policy`: Simulates whether a subject role and tenant will be granted access to a resource by `aether-authz`.
   - Tool `validate_manifest`: Verifies workload deployment specifications against platform rules.

2. **Pre-flight Local Verification (`aether doctor`)**:
   - Verifies local Rust toolchain, Docker daemon, Git, and API reachability.

3. **CI/CD Verification (`.github/workflows/ci.yml`)**:
   - Runs `cargo clippy --workspace --all-targets -- -D warnings`, `cargo nextest run --workspace`, `cargo test --doc --workspace`, and `cargo-deny` across all Rust crates.
   - Uses `dorny/paths-filter` on pull requests so non-Rust changes skip full crate compilation.

---

## 6. Cache Behavior, Failure Modes & Planned Mitigations

| Scenario / Failure Mode | Current Repository Behavior (`crates/aether-authz`) | Planned Production Mitigation |
|---|---|---|
| **Stale Cache Entries / Missed Invalidation** | `EvaluationCache` (`crates/aether-authz/src/cache.rs`) enforces a per-entry `expires_at` TTL (default `60s` in `AuthzEngineBuilder::new`, configurable via `with_cache_ttl`). | If a future Redis invalidation subscriber experiences network partition, cached decisions still expire when their TTL elapses. |
| **False-Positive 403 Spike** (Faulty policy config) | `AuthzMiddleware` currently enforces decisions immediately and returns `401 Unauthorized` or `403 Forbidden`. | Add a planned `AUTHZ_EMERGENCY_SHADOW_MODE=true` runtime toggle to revert `AuthzMiddleware` to non-blocking shadow evaluation without redeploying. |
| **High Cache Cardinality** (Capacity reached) | `EvaluationCache` (`crates/aether-authz/src/cache.rs`) wraps a `HashMap<CacheKey, CachedEntry>` in an `RwLock` with a `max_capacity` bound (default `10,000`). It is **not** LRU: when `map.len() >= self.max_capacity` on `insert()`, it calls `map.clear()`, evicting all cached entries at once before inserting the new entry. | Expose cache size metrics and evaluate whether partitioned or incremental eviction is needed before high-cardinality multi-tenant rollout. |

---

## 7. Sign-off & Implementation Milestones

- [x] **Milestone 1**: Core crates implementation (`aether-authz`, `aether-telemetry`) and active integration in `aether-router` and `aether-logd`
- [x] **Milestone 2**: Actix-Web library middleware (`crates/aether-authz/src/actix.rs`, `crates/aether-telemetry/src/actix.rs`), example proving ground (`crates/aether-authz/examples/actix_monolith.rs`), and integration tests (`crates/aether-authz/tests/actix_integration.rs`)
- [x] **Milestone 3**: Criterion micro-benchmarks establishing sub-microsecond cached evaluation (`crates/aether-authz/benches/authz_bench.rs`, `authz_policy_evaluation/cached_evaluation`, 189.28 ns) and single-thread telemetry recording (`crates/aether-telemetry/benches/telemetry_bench.rs`, `telemetry_metrics_single_thread/record_request_single_thread`, 245.59 ns) baselines
- [x] **Milestone 4**: KinD Kubernetes pipeline validation for `aether-router` and `aether-logd` in GitHub Actions CI (`.github/workflows/ci.yml`)
- [ ] **Milestone 5**: Implement planned shadow-mode configuration and metrics in `AuthzMiddleware` and run a staging dark launch
- [ ] **Milestone 6**: Implement planned distributed Redis Pub/Sub cache invalidation subscriber and canary rollout automation
