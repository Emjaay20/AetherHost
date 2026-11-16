# AetherHost Developer & AI Agent Guide (`AGENTS.md`)

This guide provides instructions, standard commands, and operational boundaries for autonomous AI coding agents (Claude Code, Cursor, Copilot, Antigravity) and human platform engineers working in the AetherHost repository.

---

## 1. Quick Reference: Build, Test & Lint Commands per Language

### Rust (`crates/`)
The native platform subsystem consists of 6 workspace crates: `aether-core`, `aether-authz`, `aether-telemetry`, `aether-router`, `aether-logd`, and `aether-cli`.

```bash
# Build all crates in debug mode
cargo build --workspace --manifest-path crates/Cargo.toml

# Build release binaries (aether, aether-router, aether-logd)
cargo build --release --manifest-path crates/Cargo.toml

# Run all unit tests, integration tests, and doc-tests
cargo test --workspace --manifest-path crates/Cargo.toml

# Fast parallel test runner (if cargo-nextest is installed)
cargo nextest run --manifest-path crates/Cargo.toml && cargo test --doc --manifest-path crates/Cargo.toml

# Strict clippy lint enforcement (zero warnings allowed in CI)
cargo clippy --workspace --all-targets --manifest-path crates/Cargo.toml -- -D warnings

# Format check
cargo fmt --all --manifest-path crates/Cargo.toml -- --check

# Run Criterion micro-benchmarks
cargo bench --workspace --manifest-path crates/Cargo.toml

# Verify dependencies, licenses, and security advisories (cargo-deny)
cargo deny check --manifest-path crates/Cargo.toml
```

### TypeScript & Monorepo (`apps/api`, `apps/dashboard`, `packages/`)
Package manager: `pnpm` (version `10.21.0` via Corepack). Node.js version `22`.

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build shared TypeScript libraries first (required by api and dashboard)
pnpm --filter @aetherhost/common build
pnpm --filter @aetherhost/domain build

# Generate Prisma client & typecheck API
pnpm --filter @aetherhost/api exec prisma generate
pnpm --filter @aetherhost/api exec tsc -p tsconfig.build.json --noEmit

# Run API unit and e2e test suite
pnpm --filter @aetherhost/api test
pnpm --filter @aetherhost/api test:e2e

# Typecheck and test Dashboard (Next.js)
pnpm --filter dashboard exec tsc --noEmit
pnpm --filter dashboard test
```

### Go (`apps/agent-go/`)
The host runtime daemon running on worker nodes. Go version `1.24`.

```bash
cd apps/agent-go

# Static analysis
go vet ./...

# Run unit tests
go test -v ./...
```

### Terraform (`terraform/`)
Infrastructure as code for DNS and cloud resources.

```bash
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
checkov -d terraform
```

### Kubernetes & GitOps (`deploy/helm/`, `deploy/gitops/`)

```bash
# Lint Helm chart
helm lint deploy/helm/aether-platform

# Validate Helm template and GitOps manifests with Kubeconform
helm template test-release deploy/helm/aether-platform --namespace aether-system | kubeconform -strict -summary -kubernetes-version 1.31.0
kubeconform -summary -ignore-missing-schemas deploy/gitops/

# Test deployment locally in KinD
kind create cluster --name aether-test
docker build -t ghcr.io/emjaay20/aether-platform:latest -f crates/Dockerfile .
kind load docker-image ghcr.io/emjaay20/aether-platform:latest --name aether-test
helm install aether-platform deploy/helm/aether-platform --namespace aether-system --create-namespace --set image.pullPolicy=Never --set autoscaling.enabled=false --set replicaCount=1
```

---

## 2. Model Context Protocol (MCP) Server: `aether mcp`

`crates/aether-cli` provides an embedded Model Context Protocol (MCP) server communicating over JSON-RPC 2.0 `stdio`. It exposes tools allowing coding agents to introspect platform architectural standards, validate manifests, and evaluate security access policies.

### Connecting Claude Code to `aether mcp`

Add the server to your Claude Code configuration file (`~/.claude.json` or project-local configuration):

```json
{
  "mcpServers": {
    "aether": {
      "command": "cargo",
      "args": [
        "run",
        "-q",
        "-p",
        "aether-cli",
        "--manifest-path",
        "crates/Cargo.toml",
        "--",
        "mcp"
      ]
    }
  }
}
```

Or when running against a compiled release binary:

```json
{
  "mcpServers": {
    "aether": {
      "command": "./crates/target/release/aether",
      "args": ["mcp"]
    }
  }
}
```

### Connecting Cursor / Antigravity / Other MCP Clients

Configure the MCP stdio command:
- **Command**: `aether` (or `cargo run -p aether-cli --manifest-path crates/Cargo.toml -- mcp`)
- **Transport**: `stdio`

---

## 3. Available MCP Tools

### 1. `get_platform_info`
Introspects supported runtimes, standard network ports, and architectural conventions.
- **Inputs**: None (`{}`)
- **Example Response**:
  ```json
  {
    "platform": "AetherHost",
    "supported_runtimes": ["nodejs", "python", "rust", "go"],
    "default_port": 3000,
    "authz_engine": "aether-authz v0.1.0",
    "telemetry": "aether-telemetry (W3C + Prometheus)",
    "edge_proxy": "aether-router on :8080"
  }
  ```

### 2. `validate_manifest`
Validates workload deployment specifications prior to execution.
- **Inputs**:
  - `name` (string, required): Application identifier (1-63 alphanumeric/hyphen characters).
  - `runtime` (string, required): `nodejs`, `python`, `rust`, or `go`.
  - `port` (number, optional): Listening container port.
- **Example Response (Success)**:
  ```json
  { "valid": true, "message": "Manifest is valid for deployment" }
  ```
- **Example Response (Failure)**:
  ```json
  { "valid": false, "errors": ["Application name must contain only alphanumeric characters and hyphens"] }
  ```

### 3. `evaluate_policy`
Evaluates fine-grained RBAC/ABAC permissions against the in-memory `aether-authz` engine. Allows agents to verify whether an action across tenant boundaries will succeed or trigger an authorization denial.
- **Inputs**:
  - `subject_id` (string, required): Actor identifier.
  - `tenant_id` (string, required): Actor tenant boundary.
  - `role` (string, required): E.g. `developer`, `admin`, `viewer`.
  - `resource_kind` (string, required): E.g. `application`.
  - `resource_id` (string, required): Target resource ID.
  - `resource_tenant` (string, required): Owner tenant ID of target resource.
  - `action` (string, required): `read`, `write`, `delete`.
- **Example Response (Allowed)**:
  ```json
  {
    "allowed": true,
    "reason": "Allowed by policy 'Developer CRUD on own apps'"
  }
  ```
- **Example Response (Denied - Cross-Tenant Violation)**:
  ```json
  {
    "allowed": false,
    "reason": "Default closed: no policy granted access"
  }
  ```

---

## 4. Architectural Boundaries & Conventions for Agents

1. **Multi-Tenant Isolation**: Never bypass tenant boundary checks. Every route in `aether-router` and `aether-logd` enforces tenant isolation via `aether-authz`.
2. **Observability**: Maintain W3C `traceparent` propagation across service boundaries. When creating or modifying endpoints, record duration and status in `MetricsRegistry`.
3. **No Unbacked Claims**: Do not add undocumented or unbenchmarked performance assertions. Run `cargo bench` when optimizing critical paths.
4. **Strict Rust Quality**: Always ensure `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass before submitting changes.
