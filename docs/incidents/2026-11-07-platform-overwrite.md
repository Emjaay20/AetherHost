# Incident: AetherHost control-plane path overwritten

**Date:** 7 November 2026

**Status:** Resolved and preventive controls deployed

## Summary

The AetherHost control-plane directory at `/opt/aetherhost` was replaced with
FlowMeet source files. The API, dashboard, database, reverse proxy, and agent
containers remained online because their images were already running, but the
Compose definition and operational scripts were no longer available from the
path used to start them.

No data-loss event was confirmed. Tenant project directories, Docker volumes,
the control-plane database, and off-host backup credentials survived. The
event exposed a deployment-boundary design flaw and an inadequate backup-failure
signal.

## Timeline (WAT)

| Time | Event |
| --- | --- |
| 5 Nov, 09:25–09:31 | Non-destructive restore drills completed successfully for the control-plane database and selected tenant databases. |
| 7 Nov, 02:30–02:53 | Scheduled backup started, then failed while Google Drive returned API quota and transient server errors. |
| 7 Nov, 06:07 | Files in `/opt/aetherhost` were replaced by FlowMeet-owned files. Host logs establish the timestamp but do not retain the shell command that performed the write. |
| 8–11 Nov | Backup and restore timers failed immediately because their scripts had been removed with the original control-plane path. |
| 11 Nov | Investigation confirmed the overwrite, recovered a clean control-plane checkout, separated control-plane and tenant paths, restored backup timers, and repaired FlowMeet from GitHub. |

## Impact

- The running control plane continued serving traffic, but could not safely be rebuilt from its expected path.
- The agent's bind mount exposed the replaced directory as `/app`, removing platform runtime assets for future provisioning.
- Backup and restore services failed with `203/EXEC`; no alert escalated the failure.
- FlowMeet's deployment checkout contained incomplete Git metadata, so retries could not cleanly clone the repository.

## Root cause and contributing factors

The platform code, operational scripts, and tenant project workspaces shared
the same mutable parent directory. A write intended for a tenant project could
therefore damage control-plane assets.

Contributing factors were:

1. Backup scripts lived inside the mutable application directory.
2. Backup failures were logged locally but did not create an operator alert.
3. Shell-command auditing was unavailable, so the exact overwrite command
   cannot be reconstructed from host evidence.
4. The agent considered an existing `.git` directory valid without checking
   whether it was a usable repository.

## Containment and remediation

- Created a root-owned control-plane checkout at `/srv/aetherhost/control`.
- Copied tenant project workspaces to `/srv/aetherhost/projects` and left the
  legacy directory intact as a recovery reference.
- Reconfigured the agent with a read-only control-plane mount and a distinct
  writable project mount.
- Moved backup and restore service entry points to the protected checkout.
- Kept encrypted Google Drive backups, adding request-rate limiting, retries,
  and a persistent Restic cache.
- Preserved FlowMeet's damaged checkout, cloned a fresh copy from GitHub, and
  verified a healthy public deployment.

## Prevention and verification

- The agent now constructs all tenant workspace paths through a normalized
  deployment-directory helper. Regression tests cover traversal and
  absolute-looking application names.
- A malformed Git checkout is preserved before a clean clone; a failed clone
  restores the preserved checkout instead of leaving an empty project folder.
- CI deploys from `/srv/aetherhost/control`, not the legacy `/opt` path.
- Backup and restore timers are verified after every layout migration.
- The next controls are Slack alerts for backup and restore failures, blocking
  CI security scans after finding triage, and documented data-access auditing.

## Lessons

Operational scripts and platform code are production dependencies. They must
not share a mutable workspace with tenant applications. A successful backup is
not enough: recovery jobs need independent monitoring and a tested restore
record.
