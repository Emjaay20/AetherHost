# Database recovery drill and full platform recovery

`deploy/backup/restore-check.sh` samples Restic data, extracts the latest SQL dump,
starts an isolated PostgreSQL container with no network/host mounts, imports SQL
with `ON_ERROR_STOP`, verifies required tables and tenant relationships, and
removes the sandbox and temporary data on exit. Detailed SQL output stays in a
protected temporary directory instead of operational logs.

Configure `RESTORE_POSTGRES_IMAGE` as a reviewed immutable image digest in the
root-owned backup configuration. Use the same PostgreSQL major version as
production. Root/Docker/Restic access and protected backup credentials are needed.
Do not execute this against the production database.

```sh
sudo bash deploy/backup/restore-check.sh
```

The JSON result reports scope, duration and verification time. No drill timing was
measured for the upgraded script in this implementation session. Historical
14-second extraction/check output did not establish full platform RTO and must
not be quoted as such. A 15-minute recovery objective and daily backup target are
goals; verify actual recovered snapshot age before stating achieved RPO.

## Complete recovery acceptance

After a database drill, run a separate isolated environment recovery:
1. Restore the control-plane configuration, source, DB and required tenant volumes
   from documented backup staging paths; verify ownership and mount locations.
2. Recover protected vault keys and required external integration configuration.
3. Start verified API/dashboard/agent images with the recovered database and Redis.
4. Verify readiness, authenticated console/API access, secret decryption, a tenant
   deployment, tenant log isolation and ingress routing using synthetic data.
5. Measure elapsed time from declared recovery start to successful user workflow;
   record snapshot age, data checks, failures and follow-up owners.

A DB load alone cannot establish the outcome of steps 3–5. Host loss recovery and
DNS cutover must be separately exercised before claiming total-loss readiness.
