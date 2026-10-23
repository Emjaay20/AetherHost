-- Add an opt-in MariaDB service to the tenant workload contract.
-- The default keeps every existing deployment unchanged.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "withMariaDb" BOOLEAN NOT NULL DEFAULT false;
