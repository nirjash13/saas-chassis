SET search_path TO billing;

-- Subscription records (mirrors Stripe state)
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL,
  stripe_customer_id  VARCHAR(100) NOT NULL,
  stripe_subscription_id VARCHAR(100),
  plan_code           VARCHAR(50) NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'trialing',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_subscription_tenant UNIQUE (tenant_id)
);

CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL,
  stripe_invoice_id   VARCHAR(100) NOT NULL,
  stripe_customer_id  VARCHAR(100) NOT NULL,
  amount_due          DECIMAL(12,2) NOT NULL,
  amount_paid         DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency            VARCHAR(3) NOT NULL DEFAULT 'usd',
  status              VARCHAR(30) NOT NULL,
  invoice_url         TEXT,
  invoice_pdf         TEXT,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stripe_invoice UNIQUE (stripe_invoice_id)
);

CREATE TABLE webhook_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id     VARCHAR(100) NOT NULL,
  event_type          VARCHAR(100) NOT NULL,
  payload             JSONB NOT NULL,
  processed           BOOLEAN NOT NULL DEFAULT false,
  processed_at        TIMESTAMPTZ,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_webhook_event UNIQUE (stripe_event_id)
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions (tenant_id);
CREATE INDEX idx_invoices_tenant ON invoices (tenant_id);
CREATE INDEX idx_webhook_events_type ON webhook_events (event_type);
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events (processed) WHERE processed = false;
