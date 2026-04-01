-- ============================================================
-- Row-Level Security Foundation
-- This creates the session variable mechanism that ALL tenant-scoped
-- tables will use. The chassis SDK sets this on every request.
-- ============================================================

-- The function that reads the current tenant context
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Check if the current session is a platform admin (bypasses RLS)
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(current_setting('app.is_platform_admin', true), 'false')::boolean;
EXCEPTION
  WHEN OTHERS THEN RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Template RLS policy (applied to every tenant-scoped table):
-- Usage: After creating a table with tenant_id column, run:
--
--   ALTER TABLE schema.table_name ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE schema.table_name FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON schema.table_name
--     USING (tenant_id = current_tenant_id() OR is_platform_admin());
--
-- The SDK middleware executes before every query:
--   SET LOCAL app.current_tenant_id = '<tenant-uuid>';
--   SET LOCAL app.is_platform_admin = 'false';
