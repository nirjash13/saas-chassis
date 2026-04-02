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

-- ============================================================
-- TEMPLATE: Standard Tenant Isolation Policy
-- Apply to every tenant-scoped table after CREATE TABLE:
--
--   ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;
--
--   -- Read policy: tenant sees own data; platform admin sees all
--   CREATE POLICY tenant_read_policy ON {schema}.{table}
--     FOR SELECT
--     USING (tenant_id = current_tenant_id() OR is_platform_admin());
--
--   -- Insert policy: tenant can only insert own data
--   CREATE POLICY tenant_write_policy ON {schema}.{table}
--     FOR INSERT
--     WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());
--
--   -- Update policy: tenant can only update own data
--   CREATE POLICY tenant_update_policy ON {schema}.{table}
--     FOR UPDATE
--     USING (tenant_id = current_tenant_id() OR is_platform_admin())
--     WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());
--
--   -- Delete policy: tenant can only delete own data
--   CREATE POLICY tenant_delete_policy ON {schema}.{table}
--     FOR DELETE
--     USING (tenant_id = current_tenant_id() OR is_platform_admin());
--
-- NOTE: Global/reference tables (feature_definitions, plans) are NOT
-- tenant-scoped — do NOT apply RLS to these.
-- ============================================================

-- ============================================================
-- TEMPLATE: Audit Table Policy (append-only for all, read restricted)
-- Apply to audit.entries:
--
--   ALTER TABLE audit.entries ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE audit.entries FORCE ROW LEVEL SECURITY;
--
--   -- All services can write audit events
--   CREATE POLICY audit_insert_policy ON audit.entries
--     FOR INSERT
--     WITH CHECK (true);
--
--   -- Only platform admin + own tenant can read audit events
--   CREATE POLICY audit_read_policy ON audit.entries
--     FOR SELECT
--     USING (tenant_id = current_tenant_id() OR is_platform_admin());
-- ============================================================

-- The SDK middleware executes before every query:
--   SET LOCAL app.current_tenant_id = '<tenant-uuid>';
--   SET LOCAL app.is_platform_admin = 'false';
