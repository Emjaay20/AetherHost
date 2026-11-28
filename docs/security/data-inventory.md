# AetherHost data inventory

The [generated field classification](data-classification.generated.md) is checked
against the Prisma schema by `security:classification` in CI. Field names tagged
personal or secret must also be included in the API redaction field list; tags are
not a substitute for access control or encryption.

This inventory identifies data that needs stronger handling than ordinary
application metadata. It is intentionally value-free.

| Data class | Location | Classification | Current protection | Required next control |
| --- | --- | --- | --- | --- |
| Tenant deployment environment variables | `Application.envVars` | Secret / tenant confidential | Authenticated AES-256-GCM envelope encryption at rest (`SecretVaultService`); unique 12-byte IV per write; omitted from ordinary listings; read/change audit logging; deployment-log redaction | Run keyring migration/rotation and retain evidence; KMS integration remains separate. |
| GitHub OAuth tokens | Clerk-backed authentication / runtime integration | Secret / tenant confidential | Server-side only; never returned in standard application records | Record token access and rotate/revoke on integration disconnect. |
| Billing provider IDs and invoice amounts | `Invoice`, `WebhookEvent`, billing configuration | Confidential financial metadata | Authenticated API paths, database-only storage, audit records for billing mutations | Define retention period and restricted operator reporting. |
| API key hashes and prefixes | `ApiKey` | Authentication material | Only SHA-256 hash plus a display prefix are stored | Add explicit expiry and revocation audit records. |
| Deployment logs | `DeploymentLog.logContent` | Potentially confidential | Credential-like values are redacted before persistence | Add retention/deletion policy and log-access audit events. |
| Push device tokens | `PushDevice.token` | Personal device identifier | Authenticated registration; tenant-scoped lookups | Define retention and disable/delete flow for inactive devices. |

## Rules

- Secrets must not appear in source control, audit metadata, application lists,
  deployment logs, or documentation.
- Audit events record the actor, resource, action, time, and non-secret
  metadata only.
- New environment writes use application-bound encryption. Legacy plaintext and
  v1 records require the dry-run/CAS migration in `key-rotation.md`; production
  migration completion is not inferred from the encryption implementation.

## Enforced lifecycle tooling

`pnpm --filter @aetherhost/api security:retention` previews deployment logs older
than `DEPLOYMENT_LOG_RETENTION_DAYS` (7–3650). `--apply` deletes eligible logs in
bounded batches. Set a policy and schedule it using restricted credentials; no
schedule or production deletion was performed here. Audit/billing records and
legal-hold data require separate policies. Document independent DB roles for
application runtime, reporting, maintenance and backup; do not describe a
single shared DB superuser as least privilege.

## Database metadata and access profiles

The classification migration adds value-free PostgreSQL column comments and a
creation-time index for bounded retention scans. It does not encrypt legacy rows.
`deploy/database/access-roles.sql` defines separate NOLOGIN runtime, reporting and
log-maintenance groups and a value-free reporting view. Runtime audit-table
permissions exclude update/delete/truncate. Apply and test role memberships with
separate login credentials; do not use a table-owner or superuser runtime login.
Existing grants are not removed automatically. Verify denied secret-table reads
as the reporter and denied audit mutations as the runtime login before claiming
least privilege or append-only application access. Database owners and privileged
administrators still require separate auditing and external tamper-resistant storage.

Maintenance commands run compiled tools. Local checkouts must first run
`pnpm --filter @aetherhost/api security:build`; production API images include them.
