SET search_path TO tenant_mgmt;

-- Master list of toggleable features across all products
CREATE TABLE feature_definitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(100) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        VARCHAR(50) NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  requires_plan   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_feature_code UNIQUE (code)
);

-- Per-tenant feature overrides
CREATE TABLE tenant_features (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_code    VARCHAR(100) NOT NULL REFERENCES feature_definitions(code),
  is_enabled      BOOLEAN NOT NULL,
  enabled_by      UUID,
  enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tenant_feature UNIQUE (tenant_id, feature_code)
);

-- Seed default features for the SaaS Chassis
INSERT INTO feature_definitions (code, name, category, default_enabled, requires_plan) VALUES
  ('module.financial_core', 'Core Financial Management', 'core', true, NULL),
  ('module.document_vault', 'Document & Invoice Storage', 'core', true, NULL),
  ('module.budgeting', 'Budgeting & Planning', 'core', true, NULL),
  ('module.payroll', 'Staff Payroll Management', 'addon', false, 'pro'),
  ('module.election', 'Digital Committee Elections', 'addon', false, 'pro'),
  ('module.visitor_mgmt', 'Smart Gatekeeper / Visitor Management', 'addon', false, 'enterprise'),
  ('module.communication', 'SMS/WhatsApp Notifications', 'premium', false, 'pro'),
  ('module.ai_assistant', 'AI-Powered Analytics', 'premium', false, 'enterprise'),
  ('module.maintenance', 'Asset & Maintenance Tracking', 'addon', false, 'pro'),
  ('module.universal_ledger', 'Double-Entry Ledger System', 'core', true, NULL);

-- RLS on tenant_features
ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_features
  USING (tenant_id = current_tenant_id() OR is_platform_admin());
