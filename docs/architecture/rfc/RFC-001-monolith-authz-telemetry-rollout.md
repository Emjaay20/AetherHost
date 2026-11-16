# RFC 001: Zero-Downtime Rollout of In-Memory Authorization and Distributed Telemetry across the Rust Monolith

- **Authors**: Platform Engineering / Team Core
- **Status**: Proposed / Approved for Implementation
- **Target Subsystems**: Actix-Web Monolith (`apps/api`), Edge Proxy (`crates/aether-router`), Log Daemon (`crates/aether-logd`)
- **Reviewers**: Architecture Review Board, Security Engineering, Core Platform Team

---

## 1. Executive Summary & Motivation

As our customer base expands to 300+ enterprise EMS and OEM customers, tenant data isolation and low-latency quoting workflows are existential requirements. Every PCBA quote, BOM component, and supply chain pricing model belongs to a strictly isolated tenant.

Historically, authorization checks were either:
1. Performed ad-hoc inside domain services by querying the PostgreSQL database, incurring 5–15ms of latency overhead per call and risking connection pool exhaustion during peak traffic.
2. Inconsistently applied across edge proxies, ingest daemons, and internal API routes.

This RFC outlines the production deployment strategy for **`aether-authz`** (sub-microsecond in-memory RBAC/ABAC engine) and **`aether-telemetry`** (W3C distributed tracing + Prometheus RED metrics) across our Actix-web backend monolith and edge infrastructure **with zero downtime and zero false-positive access disruptions**.

---

## 2. Core Architectural Components

```
+-----------------------------------------------------------------------------------+
|                                Client HTTP Request                                |
|             (Headers: X-Tenant-Id, X-Subject-Id, X-User-Role, traceparent)        |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        ActixTelemetryMiddleware (Outer Layer)                     |
|  - Ingests or generates W3C traceparent (00-<trace_id>-<parent_id>-01)            |
|  - Tracks in-flight request gauge (atomic fetch_add / fetch_sub)                  |
|  - Starts request timer                                                           |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                          AuthzMiddleware (Inner Layer)                            |
|                                                                                   |
|  1. Extract Subject from headers or JWT claims                                    |
|  2. Evaluate policy against in-memory AuthzEngine:                                |
|     - Fast path: Cached in RwLock<HashMap> (~189 ns)                              |
|     - Slow path: Uncached policy evaluation (~1.17 µs)                            |
|  3. Decision Branch:                                                              |
|     ├── [ALLOWED]: Attach AuthenticatedSubject, forward to handler                |
|     └── [DENIED]:                                                                 |
|           ├── If SHADOW_MODE = true: Log violation, increment metric, ALLOW       |
|           └── If ENFORCE_MODE = true: Short-circuit with 403 Forbidden JSON       |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                    Product Handler (e.g. PCBA Quote Handler)                      |
|  async fn get_quote(subject: AuthenticatedSubject, path: web::Path<QuoteId>)     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Four-Phase Rollout Strategy

To prevent unintentional customer service disruption (e.g. false 403 Forbidden responses on edge cases), Team Core will execute a phased rollout over 3 sprints:

```
[Phase 0: Dark Launch & Shadow Mode]
         │  (Evaluate policies, emit metrics/logs, DO NOT block traffic)
         ▼
[Phase 1: Canary Deployment]
         │  (Enforce on 5% of internal tenant traffic in staging & canary pods)
         ▼
[Phase 2: Scope-by-Scope Opt-in]
         │  (Feature teams adopt .wrap(AuthzMiddleware) on critical domains)
         ▼
[Phase 3: Global Enforcement & Invalidation Mesh]
            (Default-closed policy across all routes, Redis pub/sub invalidation)
```

### Phase 0: Dark Launch & Shadow Mode (Duration: 1 Sprint)
- **Configuration**: Deploy `AuthzMiddleware` with `shadow_mode: true`.
- **Behavior**:
  - The policy engine evaluates all incoming requests against registered RBAC/ABAC rules.
  - If a request violates policy:
    1. An audit record is emitted with `decision: "denied"`, `shadow: true`.
    2. A Prometheus counter `authz_shadow_violations_total{tenant, route, action}` is incremented.
    3. The request is **allowed through** to the underlying handler without failing.
- **Goal**: Identify misconfigured permissions, missing tenant headers, or legacy service-to-service calls that lack expected role credentials before any customer traffic is affected.

### Phase 1: Canary Deployment (Duration: 3 Days)
- **Configuration**: Deploy active enforcement to 5% of production pods via Helm/Flux canary deployment (`canary.enabled: true`).
- **Target**: Internal company tenants and staging test suites.
- **Monitoring**: Real-time Honeycomb trace inspection and Prometheus alert monitoring on `authz_denials_total`.

### Phase 2: Scope-by-Scope Domain Opt-in (Duration: 1 Sprint)
- Product engineering teams wrap their specific Actix `web::scope` domains:
  ```rust
  // PCBA Quotation Domain Scope
  App::new()
      .service(
          web::scope("/api/v1/quotes")
              .wrap(AuthzMiddleware::enforcing(authz_engine.clone()))
              .route("", web::post().to(create_pcba_quote))
              .route("/{quote_id}", web::get().to(get_pcba_quote))
      )
  ```
- Ergonomic `AuthenticatedSubject` extractor is utilized in handlers:
  ```rust
  async fn get_pcba_quote(
      subject: AuthenticatedSubject,
      path: web::Path<String>,
  ) -> impl Responder {
      // subject.tenant_id and subject.subject_id guaranteed valid and authorized
      HttpResponse::Ok().json(serde_json::json!({ "tenant": subject.tenant_id }))
  }
  ```

### Phase 3: Global Enforcement & Distributed Invalidation Mesh
- All non-public routes enforce default-closed access.
- Distributed cache invalidation is enabled across Kubernetes pods via Redis Pub/Sub:
  - When user permissions change in the control plane:
    1. The mutating service publishes `{"event": "invalidate_tenant", "tenant_id": "tenant-abc"}` to Redis channel `aether:authz:invalidation`.
    2. All active monolith pods receive the message and call `authz_engine.invalidate_tenant("tenant-abc")` within < 5ms.

---

## 4. Empirical Performance & Budget

All critical paths have been profiled using Criterion micro-benchmarks (`crates/aether-authz/benches/authz_bench.rs` and `crates/aether-telemetry/benches/telemetry_bench.rs`):

| Operation | Measured Latency (p50) | Allocated Budget | Margin |
|---|---|---|---|
| Cached Policy Evaluation | **189.28 ns** | < 1,000 ns (1 µs) | 5.3x faster |
| Uncached Policy Evaluation | **1.168 µs** | < 10,000 ns (10 µs)| 8.5x faster |
| In-Flight Gauge Inc/Dec | **3.93 ns** | < 50 ns | 12.7x faster |
| Full Request Telemetry Recording | **245.59 ns** | < 1,000 ns (1 µs) | 4.0x faster |
| 4-Thread Contention Recording | **209.63 ns** | < 1,000 ns (1 µs) | 4.7x faster |

**Impact on Monolith Latency**: The total overhead introduced by both middleware layers combined is **< 0.5 microseconds** on the cached path. This represents a 99.9% reduction in authorization overhead compared to database queries.

---

## 5. Developer Experience (DX) & The "Paved Road"

Team Core provides the following developer tools to make adoption frictionless:

1. **AI Agent Tooling (`aether mcp`)**:
   - Software engineers using Claude Code, Cursor, or Antigravity can validate permissions in real-time before writing code:
   - Tool `evaluate_policy`: Simulates whether a user role will be granted access to a resource.
   - Tool `validate_manifest`: Verifies deployment definitions against platform schema.

2. **Pre-flight Local Verification (`aether doctor`)**:
   - Developers verify that their local Rust toolchain, Redis, and KinD Kubernetes environments match production standards.

3. **CI/CD Fast Feedback Loop**:
   - `cargo nextest` parallel execution reduces test times by ~65%.
   - Path-based CI skipping ensures backend developers do not wait on Next.js frontend builds.

---

## 6. Failure Modes, Resilience & Emergency Break-Glass

| Failure Mode | Detection | Automated Mitigation |
|---|---|---|
| **Redis Invalidation Failure** (Network partition) | Invalidation queue consumer lag metric increases | Engine falls back to TTL-based cache expiration (default 300s TTL). |
| **False-Positive 403 Spike** (Faulty policy deployment) | Prometheus alert `Rate(authz_denials_total) > 5%` triggers | Emergency bypass flag `AUTHZ_EMERGENCY_SHADOW_MODE=true` reverts to non-blocking audit mode without requiring a binary redeploy. |
| **High Memory Usage** (Cardinality explosion in cache) | Prometheus metric `authz_cache_entries_count > 100,000` | LRU eviction policy kicks in; oldest tenant entries evicted. |

---

## 7. Sign-off & Implementation Milestones

- [x] **Milestone 1**: Core crates implementation (`aether-authz`, `aether-telemetry`)
- [x] **Milestone 2**: Actix-Web production middleware (`Transform`/`Service`) and integration tests
- [x] **Milestone 3**: Criterion micro-benchmarks establishing sub-microsecond baselines
- [x] **Milestone 4**: KinD Kubernetes pipeline validation in GitHub Actions CI
- [ ] **Milestone 5**: Shadow mode deployment in Staging
- [ ] **Milestone 6**: Distributed Redis invalidation subscriber integration
