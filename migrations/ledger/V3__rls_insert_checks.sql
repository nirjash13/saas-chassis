SET search_path TO ledger;

-- Add explicit per-operation policies to supplement the generic tenant_isolation
-- policy created in V1. PostgreSQL combines permissive policies with OR logic,
-- so these add explicit WITH CHECK enforcement for INSERT/UPDATE/DELETE.

-- accounts
CREATE POLICY accounts_tenant_insert ON accounts
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY accounts_tenant_update ON accounts
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY accounts_tenant_delete ON accounts
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- journal_entries
CREATE POLICY journal_entries_tenant_insert ON journal_entries
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY journal_entries_tenant_update ON journal_entries
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY journal_entries_tenant_delete ON journal_entries
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- journal_lines
CREATE POLICY journal_lines_tenant_insert ON journal_lines
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY journal_lines_tenant_update ON journal_lines
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY journal_lines_tenant_delete ON journal_lines
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- fiscal_periods
CREATE POLICY fiscal_periods_tenant_insert ON fiscal_periods
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY fiscal_periods_tenant_update ON fiscal_periods
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY fiscal_periods_tenant_delete ON fiscal_periods
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());
