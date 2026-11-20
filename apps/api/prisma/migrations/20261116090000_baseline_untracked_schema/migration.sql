-- Baseline for schema objects that reached production through `prisma db push`
-- and never had a migration: Application.commitMessage, Application.customDomain,
-- DeploymentLog and ApiKey. Without it, a database built from migrations alone
-- (a fresh install, or a rebuild during disaster recovery) lacks these objects:
-- the API fails on its first query and 20261119110000_data_classification
-- fails outright, because it comments on DeploymentLog and ApiKey.
--
-- Every statement is idempotent. On a database that already has these objects
-- the only effect is recreating the two foreign keys with the ON DELETE CASCADE
-- the schema declares, so deleting an application also removes its logs.

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "commitMessage" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Application_customDomain_key" ON "Application"("customDomain");

CREATE TABLE IF NOT EXISTS "DeploymentLog" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "logContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeploymentLog_applicationId_idx" ON "DeploymentLog"("applicationId");

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'CLI Key',
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

ALTER TABLE "DeploymentLog" DROP CONSTRAINT IF EXISTS "DeploymentLog_applicationId_fkey";
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_tenantId_fkey";
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
