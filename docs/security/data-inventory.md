# AetherHost data inventory

This inventory identifies data that needs stronger handling than ordinary
application metadata. It is intentionally value-free.

| Data class | Location | Classification | Current protection | Required next control |
| --- | --- | --- | --- | --- |
| Tenant deployment environment variables | `Application.envVars` | Secret / tenant confidential | Never included in ordinary application listings; read and change events are audited without values; deployment-log redaction | Encrypt existing and new values using a managed key, then complete a migration and key-rotation runbook. |
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
- Encryption at rest is **not yet claimed** for `Application.envVars`; the
  existing plaintext rows need a deliberate, tested migration with a protected
  key before that control can be marked complete.
