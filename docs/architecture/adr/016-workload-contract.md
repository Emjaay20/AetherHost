# ADR 016: Workload Contract for Multi-Process Apps

## Status
Accepted

## Context
A product like Signaldesk is not a single `npm start` container. It is one image, two processes (API and worker), plus Postgres and Redis. The control plane already stored `dockerImage`, `envVars`, `workerCommand`, `withPostgres`, and `withRedis`, but the agent ignored them and rendered a source mount plus an unauthenticated code-server. The Nest tick could also mark that app `running` without starting a container.

Tenant-supplied Compose is not the fix. It can request a privileged container or mount the Docker socket. The platform has to own the process graph.

## Decision
An image deploy is a workload. The agent generates Compose from the stored contract. It never executes tenant Compose for this path.

- The API and the worker use the same image. The worker command is a shell string expanded inside the container, not on the host.
- Postgres and Redis are sidecars on a private network. They have no published host ports. Their DNS names are unique so they cannot collide with the control plane database.
- The platform writes `DATABASE_URL` and `REDIS_URL`. A tenant cannot set those keys.
- Traefik is attached only to the API. The worker is not routed.
- Both processes get an init process and a 30s stop grace period so in-flight work can finish.
- The agent probes the API health path from the ingress network before the status becomes `running`. A failed probe tears the stack down.
- The Nest tick does not mark an image deploy `running`. That status belongs to the agent.
- The image must already be public or present on the host. This contract does not include registry credentials, Kubernetes, or a second cloud.

WordPress stays on its own runtime path.

## Consequences
Positive:
- A Signaldesk-shaped app can run here without importing AetherHost.
- The same image can run under Compose locally and under this agent.
- Datastore credentials are not baked into the image and are not interpolated into the Compose file.

Negative:
- This is one Docker host, not an orchestrator. There is no multi-node schedule, no autoscaler, and no private registry login.
- The worker command charset is intentionally narrow so it cannot become a host shell injection.
