SET search_path TO iam;

-- Enable RLS on iam.memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_read ON memberships
  AS PERMISSIVE FOR SELECT
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY memberships_tenant_insert ON memberships
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY memberships_tenant_update ON memberships
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY memberships_tenant_delete ON memberships
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- Enable RLS on iam.impersonation_sessions
-- Uses target_tenant_id (the tenant being impersonated into)
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY impersonation_sessions_tenant_read ON impersonation_sessions
  AS PERMISSIVE FOR SELECT
  TO chassis_app
  USING (target_tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY impersonation_sessions_tenant_insert ON impersonation_sessions
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (target_tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY impersonation_sessions_tenant_update ON impersonation_sessions
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (target_tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (target_tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY impersonation_sessions_tenant_delete ON impersonation_sessions
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (target_tenant_id = current_tenant_id() OR is_platform_admin());
