CREATE TABLE "ExternalProviderConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "teamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "tokenPayload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalProviderOAuthState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierPayload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalProviderOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalProviderConnection_tenantId_provider_key" ON "ExternalProviderConnection"("tenantId", "provider");
CREATE INDEX "ExternalProviderConnection_tenantId_updatedAt_idx" ON "ExternalProviderConnection"("tenantId", "updatedAt");
CREATE UNIQUE INDEX "ExternalProviderOAuthState_stateHash_key" ON "ExternalProviderOAuthState"("stateHash");
CREATE INDEX "ExternalProviderOAuthState_tenantId_provider_idx" ON "ExternalProviderOAuthState"("tenantId", "provider");
CREATE INDEX "ExternalProviderOAuthState_expiresAt_idx" ON "ExternalProviderOAuthState"("expiresAt");

ALTER TABLE "ExternalProviderConnection" ADD CONSTRAINT "ExternalProviderConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalProviderOAuthState" ADD CONSTRAINT "ExternalProviderOAuthState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
