SET search_path TO tenant_mgmt;

-- Add explicit per-operation policies for tenant_features to supplement the
-- generic tenant_isolation policy created in V2. PostgreSQL combines permissive
-- policies with OR logic, so these add explicit WITH CHECK enforcement for
-- INSERT/UPDATE/DELETE.

CREATE POLICY tenant_features_tenant_insert ON tenant_features
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY tenant_features_tenant_update ON tenant_features
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY tenant_features_tenant_delete ON tenant_features
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());
