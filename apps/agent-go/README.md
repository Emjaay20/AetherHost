# AetherHost Go Agent

This is the first out-of-process worker for AetherHost.

It acts as a worker node that polls the control plane for `pending` applications of a specific runtime, and instructs the control plane to provision them.

## Usage

```bash
cd apps/agent-go
go run .
```

### Environment Variables
- `CONTROL_PLANE_URL` - Default: `http://127.0.0.1:3000`
- `AGENT_RUNTIME` - The runtime to watch for. Default: `nodejs`
