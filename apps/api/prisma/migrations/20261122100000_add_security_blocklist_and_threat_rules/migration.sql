-- Idempotent security blocklist, threat rules, revision tracking, and analytics views migration.
-- Safe to run on both fresh databases and databases where baseline security tables already exist.

-- 1. Application deployment revision and first-running timestamp columns
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "lastDeployedRevision" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "lastDeployedAt" TIMESTAMP(3);

-- 2. SecurityBlocklist table & indexes
CREATE TABLE IF NOT EXISTS "SecurityBlocklist" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityBlocklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityBlocklist_value_key" ON "SecurityBlocklist"("value");
CREATE INDEX IF NOT EXISTS "SecurityBlocklist_type_idx" ON "SecurityBlocklist"("type");
CREATE INDEX IF NOT EXISTS "SecurityBlocklist_value_idx" ON "SecurityBlocklist"("value");

-- 3. SecurityThreatRule table, approval lifecycle columns & indexes
CREATE TABLE IF NOT EXISTS "SecurityThreatRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "source" TEXT NOT NULL DEFAULT 'BUILTIN',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityThreatRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SecurityThreatRule" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SecurityThreatRule" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "SecurityThreatRule" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'BUILTIN';
ALTER TABLE "SecurityThreatRule" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "SecurityThreatRule" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityThreatRule_name_key" ON "SecurityThreatRule"("name");
CREATE INDEX IF NOT EXISTS "SecurityThreatRule_category_idx" ON "SecurityThreatRule"("category");
CREATE INDEX IF NOT EXISTS "SecurityThreatRule_enabled_status_idx" ON "SecurityThreatRule"("enabled", "status");

-- 4. Seed initial known malicious actors into blocklist
INSERT INTO "SecurityBlocklist" ("id", "type", "value", "reason")
VALUES
    ('block_seed_email_1', 'email', 'zxy1715x@gmail.com', 'Repeated deployment of unauthorized Nezha C2 agents'),
    ('block_seed_ghuser_1', 'github_user', 'zx1447', 'Associated with abusive remote-control agent deployments'),
    ('block_seed_ghid_1', 'github_id', '216457174', 'GitHub user ID associated with zx1447 and repeated abuse'),
    ('block_seed_domain_1', 'domain', 'vip1715.dpdns.org', 'Identified Nezha C2 dashboard host'),
    ('block_seed_domain_2', 'domain', 'maike.fadehost.app', 'Identified Nezha C2 dashboard host')
ON CONFLICT ("value") DO NOTHING;

-- 5. Ensure analytics views exist for control plane reporting
CREATE OR REPLACE VIEW analytics_mrr AS
SELECT
  date_trunc('month', "createdAt") as month,
  SUM("amountCent") as total_mrr_cent
FROM "Invoice"
WHERE status = 'paid'
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_tenant_cohorts AS
SELECT
  date_trunc('month', "createdAt") as cohort_month,
  COUNT(*) as new_tenants
FROM "Tenant"
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_ai_usage_trends AS
SELECT
  "tenantId",
  SUM("usageAiRequests") as total_requests,
  SUM("totalAiTokens") as total_tokens
FROM "TenantEntitlement"
GROUP BY 1
ORDER BY 2 DESC;

-- 6. Reconcile application quota usage counters with retained non-terminated application rows
UPDATE "TenantEntitlement" te
SET "usageApplications" = (
  SELECT COUNT(*)
  FROM "Application" a
  WHERE a."tenantId" = te."tenantId"
    AND a."status" <> 'terminated'
);

