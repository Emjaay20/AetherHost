# AetherHost Go Agent

Out-of-process worker. It polls the control plane for `pending` applications and renders Compose on the local Docker host. It does not execute tenant-supplied Compose.

## Usage

```bash
cd apps/agent-go
go run .
```

### Environment Variables
- `CONTROL_PLANE_URL` - Default: `http://localhost:3000`
- `AGENT_SECRET_KEY` - Sent as `x-agent-key`
- `HOST_PWD` - Host path to the repo, used by the WordPress runtime. Default: `/opt/aetherhost`

## Workload contract

Set `dockerImage` on a Node application to deploy a multi-process app. The same image runs the API. `workerCommand` starts a second process. `withPostgres` and `withRedis` attach private sidecars. The agent writes `DATABASE_URL` and `REDIS_URL`. Traefik routes only the API, at `http://<name>.localhost`.

The image must already be public or present on the host. This is not Kubernetes.
