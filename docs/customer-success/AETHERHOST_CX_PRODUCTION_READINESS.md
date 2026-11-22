# AetherHost Customer Experience & Production Readiness

## Purpose

This initiative measures AetherHost by the outcome a customer receives: moving from source code to a verified, understandable, recoverable application without needing private operator assistance.

The target customer segments are software developers and digital agencies first. WordPress developers, founders, students, and AI-application builders are supported workloads, but they should not make the primary deployment path harder to understand.

## Delivered foundation

### Source-first deployment

The deployment form now begins with what a customer has, rather than a confusing list of runtimes:

- Import a GitHub repository.
- Deploy an existing container image.
- Launch managed WordPress.
- Start from a Node.js, Python, Go, or Rust template.

Repository inspection is server-side and read-only. It checks a bounded source view for framework, package-manager, Dockerfile, and monorepo markers. It does not alter source code or invent a build command. A checked-in Dockerfile remains authoritative.

### First-deployment guidance

The console presents a launch checklist until the customer has an application, runtime-health evidence, and a configured custom domain. The checklist deliberately treats domain configuration and successful HTTPS verification as different things.

### Truthful operational state

- An applications API failure is shown as a visible console alert. It is no longer represented as an empty workspace.
- Missing deployment logs are represented as missing evidence, never as a fabricated successful health check.
- Custom-domain UI distinguishes DNS verification from HTTPS activation. Saving a hostname does not claim that the site is live.

### Security review boundary

AI-discovered threat patterns are staged for human approval before becoming active blocking rules. The regression suite covers this approval gate. This avoids treating an AI finding as an unexplained account-wide suspension.

## Customer journey and acceptance criteria

| Stage | Customer outcome | Evidence required |
| --- | --- | --- |
| Discover | Understand what can be deployed and where it runs | Current supported-workload documentation; no unmeasured performance claims |
| Onboard | Know the next action after sign-in | Launch checklist and explicit empty state |
| Configure | Select a source and validate it before consuming build capacity | Repository inspection or image/workload validation response |
| Deploy | See meaningful lifecycle steps and errors | Timestamped agent logs and status transitions |
| Verify | Know the application is actually available | Readiness evidence, not merely a running container |
| Domain | Know whether DNS and HTTPS are independently ready | DNS + TLS verification states |
| Operate | Find logs, secrets, domains, and recovery controls per application | Dedicated application management surface |
| Recover | Restore or export persistent data without operator-only access | Tested restore procedure and audited access |

## Remaining implementation phases

### 1. Deployment configuration completion

- GitHub repository picker with permission validation and branch selection.
- Root-directory selection for monorepos.
- Reviewable generated deployment plan for supported source profiles with no Dockerfile.
- Required-environment-variable detection from repository configuration.

### 2. Application management

- Dedicated application overview with deployments, logs, metrics, domains, secrets, backups, and settings.
- Status model that separates healthy, degraded, deploying, failed, unknown, and suspended.
- Rollback to an immutable prior image or source revision with confirmation and audit trail.

### 3. Availability and observability

- Runtime CPU, memory, disk, bandwidth, latency, restart history, and uptime from measured telemetry.
- Dependency-aware health so a reachable application with failed required services is degraded, not healthy.
- Customer notification preferences for failed deployments and recovery events.

### 4. Domains, data, and recovery

- Per-application domain verification history and clear remediation instructions.
- Customer-visible backup status, restore points, and tested restore workflow.
- Managed database and storage views that expose only tenant-authorized resources.

### 5. Billing and support

- Self-service plan changes where the billing provider supports them.
- Clear checkout error messages, invoices, renewal status, cancellation consequences, and plan-limit guidance.
- In-product support handoff containing only redacted deployment context.

### 6. Customer acceptance test

Run this with a fresh non-admin Starter tenant:

1. Deploy a Next.js, Python, WordPress, Rust, Go, and Docker-based sample application individually.
2. Exercise one controlled failure per workload: missing environment variable, invalid health path, wrong port, invalid domain record, and inaccessible repository.
3. Verify that the UI identifies the cause, offers only safe remediation, and never reports a healthy state without evidence.
4. Record a recovery and backup-restore result before presenting commercial-readiness claims.

## Validation performed for the delivered foundation

- API unit tests: 140 passing.
- API TypeScript build check: passing.
- Dashboard tests: 13 passing.
- Dashboard TypeScript check: passing.
- Dashboard production build: passing.

These results verify source behavior. Production rollout still requires the normal reviewed deployment process and a live acceptance run with a non-admin account.
