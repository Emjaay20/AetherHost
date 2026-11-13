# ADR 017: WordPress Is a Workload Profile

## Status

Accepted

## Context

ADR 016 introduced a platform-owned workload contract for an API, worker, and
optional private datastores. WordPress was excluded from that contract and the
agent rendered a separate, hand-written Compose document. That second path had
four material differences:

- MariaDB credentials were interpolated into the Compose document.
- The WordPress services had no bounded memory or PID budgets.
- PHP, MariaDB, and nginx all joined the shared ingress network.
- Existing static configuration used fixed PHP-FPM and InnoDB values regardless
  of the application's available memory.

The special path made the platform's runtime-agnostic claim untrue in code and
created a higher-risk deployment path for a stateful workload.

## Decision

WordPress is a platform-owned workload profile under the ADR 016 contract.
The profile generates a fixed service graph:

| Service | Network exposure | Persistent data | Role |
| --- | --- | --- | --- |
| nginx | ingress and private | shared WordPress files, read-only | sole routed web service |
| php-fpm | private | shared WordPress files | WordPress runtime |
| MariaDB | private | `db_data` | WordPress database |
| Redis | private | none | authenticated, ephemeral object-cache backend |

The profile uses the same generated deployment directory and protected env-file
credentials as image workloads. The Compose file contains references to env
files, never datastore passwords. nginx is the only service with Traefik
labels. All services have bounded memory, PID limits, an init process, a stop
grace period, and `no-new-privileges`; capability dropping is not applied to
MariaDB because its upstream entrypoint must initialise and chown a fresh data
volume.

The readiness probe is executed from the shared ingress network against nginx's
private alias and `/.aetherhost/ready`. It does not mark an application running
merely because PHP-FPM or MariaDB can respond internally.

### Compatibility

Historical WordPress deployments used their normalized display name as the
Compose project name. The profile intentionally retains that identity and names
the two legacy volumes exactly `aetherhost-<name>_wordpress_data` and
`aetherhost-<name>_db_data`. This makes a contract-profile redeploy reuse posts,
uploads, and the initialized database. Redis deliberately has no persistent
volume: it is a rebuildable cache, not an application source of record.

The legacy renderer kept the generated database password in the per-app Compose
file. On the first profile deployment, the agent reads that one local value into
the protected workload credential record before replacing Compose. This is a
one-time migration path; the password is not logged or written into the new
Compose file.

## Tuning boundary

`workloadMemoryMb` is a bounded WordPress profile budget (1,024–4,096 MiB).
The profile derives PHP-FPM and MariaDB settings from the split service budgets
instead of using one server-wide setting. The formula and its conservative
assumptions live beside the implementation and are covered by table tests.
Runtime measurements and load-test validation remain an operational requirement;
they are not fabricated in this ADR.

## Consequences

Positive:

- WordPress follows the same secrets, lifecycle, network, and readiness model
  as other managed workloads.
- A redeploy retains existing WordPress data by design.
- A memory budget produces inspectable, repeatable runtime settings.

Negative:

- This is still a single-host Docker Compose platform, not a clustered database
  or autoscaling system.
- Redis connection settings are supplied to WordPress, but activation of an
  object-cache plugin must be proven in the local end-to-end smoke test before
  it is represented as an enabled cache in customer-facing UI.
