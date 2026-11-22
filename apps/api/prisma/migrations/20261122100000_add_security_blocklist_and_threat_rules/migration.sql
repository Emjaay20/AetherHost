-- CreateTable
CREATE TABLE "SecurityBlocklist" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityThreatRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityThreatRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityBlocklist_value_key" ON "SecurityBlocklist"("value");

-- CreateIndex
CREATE INDEX "SecurityBlocklist_type_idx" ON "SecurityBlocklist"("type");

-- CreateIndex
CREATE INDEX "SecurityBlocklist_value_idx" ON "SecurityBlocklist"("value");

-- CreateIndex
CREATE INDEX "SecurityThreatRule_category_idx" ON "SecurityThreatRule"("category");

-- Seed initial known malicious actors into blocklist
INSERT INTO "SecurityBlocklist" ("id", "type", "value", "reason")
VALUES
    ('block_seed_email_1', 'email', 'zxy1715x@gmail.com', 'Repeated deployment of unauthorized Nezha C2 agents'),
    ('block_seed_ghuser_1', 'github_user', 'zx1447', 'Associated with abusive remote-control agent deployments'),
    ('block_seed_ghid_1', 'github_id', '216457174', 'GitHub user ID associated with zx1447 and repeated abuse'),
    ('block_seed_domain_1', 'domain', 'vip1715.dpdns.org', 'Identified Nezha C2 dashboard host'),
    ('block_seed_domain_2', 'domain', 'maike.fadehost.app', 'Identified Nezha C2 dashboard host')
ON CONFLICT ("value") DO NOTHING;
