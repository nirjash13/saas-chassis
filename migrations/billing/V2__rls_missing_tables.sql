SET search_path TO billing;

-- Enable RLS on billing.subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_tenant_read ON subscriptions
  AS PERMISSIVE FOR SELECT
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY subscriptions_tenant_insert ON subscriptions
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY subscriptions_tenant_update ON subscriptions
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY subscriptions_tenant_delete ON subscriptions
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- Enable RLS on billing.invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_tenant_read ON invoices
  AS PERMISSIVE FOR SELECT
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY invoices_tenant_insert ON invoices
  AS PERMISSIVE FOR INSERT
  TO chassis_app
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY invoices_tenant_update ON invoices
  AS PERMISSIVE FOR UPDATE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_platform_admin());

CREATE POLICY invoices_tenant_delete ON invoices
  AS PERMISSIVE FOR DELETE
  TO chassis_app
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- NOTE: billing.webhook_events has no tenant_id — it is a global Stripe event log.
-- RLS is not applied to webhook_events.
