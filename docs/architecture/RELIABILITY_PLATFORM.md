# AetherHost Reliability & Security Architecture

AetherHost is a developer-facing hosting control plane with a deliberately separated execution layer. This upgrade adds secure workload defaults, credentialed private datastores, off-host backup automation, restore drills, and bounded cache maintenance without changing the routes or compose files of existing applications.

## Production request and control flow

```mermaid
flowchart LR
    user["Developer / Tenant"] --> console["Next.js console"]
    console --> api["NestJS control plane"]
    api --> postgres["Control-plane PostgreSQL\nprivate network"]
    api --> redis["Control-plane Redis\nprivate network"]
    api --> agent["Go runtime agent\nauthenticated control channel"]
    agent --> docker["Docker socket proxy"]
    docker --> workload["Tenant workload\nresource-limited container"]
    edge["Traefik edge\nTLS + routing"] --> workload
    internet["Internet"] --> edge
    workload --> appdb["Optional Postgres or MariaDB\nprivate only"]
    workload --> cache["Optional password-protected Redis\nprivate only"]
```

## Network boundaries

```mermaid
flowchart TB
    internet["Public internet"] -->|"80 / 443"| edge["Traefik ingress"]
    ssh["Operator SSH key"] -->|"22"| access["Hardened operator access"]

    subgraph platform["AetherHost VPS"]
        subgraph ingress["Shared ingress network"]
            edge
            console["Dashboard"]
            api["API"]
            app["Public app API"]
        end
        subgraph control["Internal control-plane network"]
            api
            pg["Platform Postgres"]
            redis["Platform Redis"]
            agent["Go agent"]
            proxy["Docker socket proxy"]
        end
        subgraph tenant["Per-workload private network"]
            app
            worker["Optional worker"]
            tenantpg["Tenant Postgres"]
            mariadb["Tenant MariaDB"]
            tenantredis["Tenant Redis"]
        end
    end

    edge -. "Only public app process joins ingress" .-> app
    app --> tenantpg
    app --> mariadb
    app --> tenantredis
```

## Recovery and operational feedback loop

```mermaid
sequenceDiagram
    participant Timer as systemd timer
    participant Backup as restic backup job
    participant VPS as VPS data and volumes
    participant Drive as Google Drive (encrypted)
    participant Drill as weekly restore check
    participant Operator as Operator

    Timer->>Backup: daily backup
    Backup->>VPS: dump control-plane DB and archive tenant volumes
    Backup->>Drive: encrypt, deduplicate, retain
    Timer->>Drill: weekly non-destructive restore
    Drill->>Drive: integrity check and restore latest snapshot
    Drill-->>Operator: pass/fail evidence
    Operator->>VPS: act on alert or declared recovery
```

## Reliability contract

| Concern | Platform control | Evidence to retain |
| --- | --- | --- |
| Availability | readiness checks, restart policy, health probes, safe failure teardown | deployment log and health result |
| Capacity | CPU, memory and PID ceilings; 10GB bounded BuildKit cache | dashboard telemetry and maintenance logs |
| Data integrity | private credentialed data services; encrypted off-host backups | backup report and weekly restore drill |
| Security | no public datastore ports, non-privileged workload defaults, least-privilege Docker proxy | compose output and security review |
| Developer experience | one deployment contract for app, worker and optional data services | generated workload manifest and runbook |

## Compatibility rules

1. Existing applications continue to use their existing deployment manifests.
2. Postgres, MariaDB, and Redis are opt-in for new image workloads.
3. The API migration adds a boolean with a false default; it does not modify existing workload records.
4. Backups and maintenance are systemd jobs outside the request path. They do not restart tenant applications.

## Scope boundary

This is a production-minded single-node platform, not a claim of globally distributed or multi-region high availability. Its engineering value is a repeatable, observable operating model with tested recovery and explicit resource boundaries.
