CREATE TABLE "ExternalFrontendDeployment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "artifactPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "spaceId" TEXT,
    "spaceSlug" TEXT,
    "liveUrl" TEXT,
    "immutableUrl" TEXT,
    "versionId" TEXT,
    "operationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalFrontendDeployment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalFrontendDeployment_idempotencyKey_key" ON "ExternalFrontendDeployment"("idempotencyKey");
CREATE UNIQUE INDEX "ExternalFrontendDeployment_applicationId_provider_key" ON "ExternalFrontendDeployment"("applicationId", "provider");
CREATE INDEX "ExternalFrontendDeployment_tenantId_updatedAt_idx" ON "ExternalFrontendDeployment"("tenantId", "updatedAt");

ALTER TABLE "ExternalFrontendDeployment" ADD CONSTRAINT "ExternalFrontendDeployment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalFrontendDeployment" ADD CONSTRAINT "ExternalFrontendDeployment_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
