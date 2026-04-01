-- ============================================================
-- RLS Integration Test Script
-- Run manually to verify RLS works correctly
-- Usage: docker compose exec postgres psql -U chassis_admin -d saas_chassis -f /docker-entrypoint-initdb.d/99-rls-integration-test.sql
-- ============================================================

-- Setup: Create a temporary test table
SET ROLE chassis_admin;

CREATE TABLE IF NOT EXISTS ledger.rls_test (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  data TEXT NOT NULL
);
ALTER TABLE ledger.rls_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.rls_test FORCE ROW LEVEL SECURITY;

-- Drop policies if they exist (for re-runs)
DROP POLICY IF EXISTS tenant_isolation ON ledger.rls_test;
DROP POLICY IF EXISTS tenant_write ON ledger.rls_test;

CREATE POLICY tenant_isolation ON ledger.rls_test
  USING (tenant_id = current_tenant_id() OR is_platform_admin());
CREATE POLICY tenant_write ON ledger.rls_test
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

-- Grant to chassis_app
GRANT ALL ON ledger.rls_test TO chassis_app;

INSERT INTO ledger.rls_test (tenant_id, data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A data'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B data');

-- Test 1: As Tenant A, should only see Tenant A data
SET ROLE chassis_app;
BEGIN;
SET LOCAL app.current_tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL app.is_platform_admin = 'false';
SELECT 'Test 1 - Tenant A sees:' AS test, count(*) AS rows FROM ledger.rls_test;
-- Expected: 1 row
COMMIT;

-- Test 2: As Platform Admin, should see all data
BEGIN;
SET LOCAL app.current_tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL app.is_platform_admin = 'true';
SELECT 'Test 2 - Platform Admin sees:' AS test, count(*) AS rows FROM ledger.rls_test;
-- Expected: 2 rows
COMMIT;

-- Cleanup
SET ROLE chassis_admin;
DROP TABLE ledger.rls_test;
RESET ROLE;
