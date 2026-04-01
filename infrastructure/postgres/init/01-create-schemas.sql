-- ============================================================
-- SaaS Chassis: Schema Initialization
-- Each service owns its own schema. RLS is configured per-schema.
-- ============================================================

-- Create schemas (chassis-owned only — consumer apps create their own schemas)
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS tenant_mgmt;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS ledger;
CREATE SCHEMA IF NOT EXISTS audit;

-- Create a dedicated application role (services connect as this role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chassis_app') THEN
    CREATE ROLE chassis_app WITH LOGIN PASSWORD 'chassis_app_pwd';
  END IF;
END
$$;

-- Grant schema usage
GRANT USAGE ON SCHEMA iam, tenant_mgmt, billing, ledger, audit TO chassis_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA iam, tenant_mgmt, billing, ledger, audit TO chassis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA iam GRANT ALL ON TABLES TO chassis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_mgmt GRANT ALL ON TABLES TO chassis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT ALL ON TABLES TO chassis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ledger GRANT ALL ON TABLES TO chassis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT ALL ON TABLES TO chassis_app;

-- Allow the chassis_app role to create new schemas
-- (consumer apps like BariManager will create their own schemas at startup)
GRANT CREATE ON DATABASE saas_chassis TO chassis_app;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
