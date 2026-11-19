# Vault configuration, migration and rotation

Production startup requires a dedicated key. Preferred configuration:
`TENANT_SECRETS_KEYRING` is a JSON object of key IDs to canonical base64 32-byte
random keys. `TENANT_SECRETS_CURRENT_KEY_ID` selects the writer. Generate keys
in a protected secret manager; do not put values into command history or docs.

A 32+ character `TENANT_SECRETS_ENCRYPTION_KEY` supports staged compatibility;
its historical SHA-256 derivation is retained. It is not password stretching or
KMS envelope encryption. The hardcoded fallback is removed. Agent credentials
can only help read historical v1 records and are never used for new encryption.
If the old host ever used the former fallback, treat that historical data as
exposed and handle a deliberate protected migration; no silent fallback remains.

V2 AES-GCM authenticates `[version, keyId, context]`. Application environment
context is `application:<tenantId>:<applicationId>`. Invalid envelopes, unknown
versions/keys and changed context fail authentication rather than returning data.

## Rollout

1. Inventory existing keys and protect an off-host backup and recovery copy of keys.
2. Supply the old v1 derivation input as `TENANT_SECRETS_LEGACY_KEY` when changing
   dedicated keys. Do not retire it before migration and backup retention review.
3. Configure old and new named keys in the protected keyring; choose the new writer.
4. Run `pnpm --filter @aetherhost/api security:migrate-secrets` with protected DB
   access. Dry-run decrypts and validates every record without writing.
5. Run the same command with `--apply` after checking the dry-run. Updates compare
   the original JSON to avoid overwriting concurrent writes. Conflicts fail the run;
   rerun after investigation. No plaintext or ciphertext is printed.
6. Run a second dry-run and application secret-read/deployment checks. Keep old keys
   while retained backups require them. Only then retire old keys and verify
   retired-key ciphertext is rejected in a synthetic test.

Migration never asserts that production plaintext coverage is zero without a
successful run and recorded DB evidence. KMS-managed data-key wrapping remains a
separate integration; the AWS lab's KMS key does not automatically back this vault.

Maintenance commands run compiled tools. Local checkouts must first run
`pnpm --filter @aetherhost/api security:build`; production API images include them.
