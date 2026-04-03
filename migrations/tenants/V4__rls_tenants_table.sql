SET search_path TO tenant_mgmt;

-- Enable RLS on tenant_mgmt.tenants
-- The tenants table uses `id` as its tenant identifier (it IS the tenant record).
-- A tenant session can read/update only its own row; platform admins have full access.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_tenant_read ON tenants
  AS PERMISSIVE FOR SELECT
  TO chassis_app
  USING (id = current_tenant_id() OR is_platform_admin());

-- Only platform admins may create new tenant records (provisioning path)
CREATE POLICY tenants_tenant_insert ON tenants
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (is_platform_admin());

CREATE POLICY tenants_tenant_update ON tenants
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (id = current_tenant_id() OR is_platform_admin());

-- Only platform admins may delete tenant records
CREATE POLICY tenants_tenant_delete ON tenants
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (is_platform_admin());
