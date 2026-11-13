# WordPress Workload Remediation Report

## Scope

This report records the first remediation stage for the AetherHost WordPress
runtime. It is intentionally limited to local source and test work. No deployed
host or tenant application was changed.

## Issues discovered

1. WordPress bypassed the workload contract through a separate Compose renderer.
2. Database credentials were rendered directly into that Compose document.
3. nginx, PHP, and MariaDB shared the public ingress network.
4. The WordPress containers had no memory or PID limits.
5. PHP-FPM and MariaDB tuning was static, so a small and large deployment would
   receive the same values.

## Fixes implemented

- Added a `wordpress` workload profile to the Go agent's common plan renderer.
- Moved database and Redis credentials into protected env files.
- Restricted Traefik routing to nginx; PHP, MariaDB, and Redis use the private
  workload network only.
- Added per-service lifecycle limits and ingress-network readiness probing.
- Added `workloadMemoryMb` to the persisted application contract, with a
  1,024–4,096 MiB validation range for WordPress.
- Derived PHP-FPM and MariaDB configuration from that budget and rendered the
  resulting configuration into the managed deployment directory.
- Preserved legacy `wordpress_data` and `db_data` volume names to protect
  existing posts, uploads, and databases during a redeploy.
- Added a one-time migration from the legacy generated Compose password into
  the protected workload credential record before the legacy file is replaced.
- Changed the WordPress Redis sidecar to a non-persistent cache after the first
  live disposable smoke test showed the persistent append-only mode could not
  initialise its data directory under the restricted runtime permissions.

## Verification performed

- `go test ./...` in `apps/agent-go` passed.
- The tests assert that WordPress is a contract workload, only nginx is routed,
  credentials do not appear in generated Compose, generated limits exist,
  legacy volume names are stable, and small/large tuning stays within the
  corresponding memory budgets.
- API contract tests accept a bounded WordPress memory budget and reject an
  unsafe one.

## Validation still required before production rollout

The local Docker daemon was unavailable in this development environment, so an
end-to-end WordPress container run, seeded data migration, cache activation,
load test, and database-failure drill have not been claimed as complete. The
next stage must run those checks locally, record command output and measured
latency/error values, and only then decide whether to deploy this profile.

## Observability implementation

The second source stage adds one internal agent Prometheus endpoint rather than
separate PHP, MariaDB, Redis, and nginx exporter containers for every tenant.
It collects PHP-FPM worker state through nginx loopback, MariaDB status and
limits through the private container, and Redis cache counters through the
private container. Prometheus scrapes the agent over the control-plane Docker
network; Grafana and alerts cover worker saturation, database connection
pressure, ingress readiness, and Redis eviction.

Nginx FastCGI-cache hit/miss metrics are intentionally not reported: the new
profile does not enable a generic PHP cache that could accidentally cache
personalized or authenticated responses. Cache claims will be added only after
an explicit cache design and measured validation.
