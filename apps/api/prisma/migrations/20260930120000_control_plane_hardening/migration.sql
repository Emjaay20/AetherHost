-- AlterTable
ALTER TABLE "TenantEntitlement" ADD COLUMN IF NOT EXISTS "limitAiRequests" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "TenantEntitlement" ADD COLUMN IF NOT EXISTS "usageAiRequests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantEntitlement" ADD COLUMN IF NOT EXISTS "totalAiTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantEntitlement" ADD COLUMN IF NOT EXISTS "currentMemoryMb" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "DomainEventRecord" ADD COLUMN IF NOT EXISTS "payload" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_providerEventId_key" ON "WebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Application_tenantId_idx" ON "Application"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Application_tenantId_status_idx" ON "Application"("tenantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DomainEventRecord_tenantId_idx" ON "DomainEventRecord"("tenantId");
