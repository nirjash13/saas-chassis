SET search_path TO tenant_mgmt;

CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(50) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  price_monthly   DECIMAL(10,2),
  price_yearly    DECIMAL(10,2),
  stripe_price_id_monthly VARCHAR(100),
  stripe_price_id_yearly  VARCHAR(100),
  max_users       INTEGER,
  max_units       INTEGER,
  included_features JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_plan_code UNIQUE (code)
);

INSERT INTO plans (code, name, price_monthly, max_users, max_units, included_features) VALUES
  ('free', 'Free', 0, 5, 1, '["module.financial_core", "module.universal_ledger"]'),
  ('starter', 'Starter', 9.99, 20, 5, '["module.financial_core", "module.universal_ledger", "module.document_vault", "module.budgeting"]'),
  ('pro', 'Professional', 29.99, 100, 20, '["module.financial_core", "module.universal_ledger", "module.document_vault", "module.budgeting", "module.payroll", "module.election", "module.communication", "module.maintenance"]'),
  ('enterprise', 'Enterprise', 99.99, NULL, NULL, '["module.financial_core", "module.universal_ledger", "module.document_vault", "module.budgeting", "module.payroll", "module.election", "module.communication", "module.maintenance", "module.visitor_mgmt", "module.ai_assistant"]');
