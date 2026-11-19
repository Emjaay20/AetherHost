-- Apply explicitly as the database owner after reviewing current grants.
-- NOLOGIN groups: provision separate credentials and membership outside source control.
-- This does not revoke privileges from the existing runtime login or change ownership.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aether_runtime') THEN
    CREATE ROLE aether_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aether_reporter') THEN
    CREATE ROLE aether_reporter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aether_log_maintenance') THEN
    CREATE ROLE aether_log_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO aether_runtime, aether_log_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aether_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aether_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM aether_runtime;
GRANT SELECT, DELETE ON "DeploymentLog" TO aether_log_maintenance;
CREATE SCHEMA IF NOT EXISTS security_reporting;
CREATE OR REPLACE VIEW security_reporting.application_inventory AS
  SELECT id, "tenantId", runtime, status, "createdAt" FROM "Application";
REVOKE ALL ON SCHEMA security_reporting FROM PUBLIC;
REVOKE ALL ON security_reporting.application_inventory FROM PUBLIC;
GRANT USAGE ON SCHEMA security_reporting TO aether_reporter;
GRANT SELECT ON security_reporting.application_inventory TO aether_reporter;
-- Grant memberships to reviewed individual service logins, never the reporter to
-- a runtime owner/superuser. Run migrations using a distinct owner credential.
-- Review grants whenever a migration adds tables: new tables are not auto-granted.
