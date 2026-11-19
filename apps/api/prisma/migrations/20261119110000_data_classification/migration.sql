-- Value-free database classification metadata. These comments do not grant access.
COMMENT ON COLUMN "Application"."envVars" IS 'classification=secret; owner=platform; handling=application-bound-aes-gcm; legacy-migration=required';
COMMENT ON COLUMN "ExternalProviderConnection"."tokenPayload" IS 'classification=secret; owner=integrations; handling=server-only-encrypted-credentials';
COMMENT ON COLUMN "ApiKey"."keyHash" IS 'classification=authentication-material; handling=hash-only';
COMMENT ON COLUMN "DeploymentLog"."logContent" IS 'classification=tenant-confidential; handling=redact-before-write; retention=operator-configured';
COMMENT ON COLUMN "PushDevice"."token" IS 'classification=personal-device-identifier; handling=tenant-scoped';
COMMENT ON COLUMN "AuditLog"."metadata" IS 'classification=confidential-audit; handling=no-secrets; retention=separate-audit-policy';
-- Prisma applies this migration in a transaction. PostgreSQL prohibits
-- CREATE INDEX CONCURRENTLY in a transaction block, so use the regular,
-- idempotent form during the controlled migration window instead.
CREATE INDEX IF NOT EXISTS "DeploymentLog_createdAt_idx" ON "DeploymentLog" ("createdAt");
