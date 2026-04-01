SET search_path TO tenant_mgmt;

CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  status          tenant_status NOT NULL DEFAULT 'provisioning',

  -- Billing linkage
  stripe_customer_id  VARCHAR(100),
  current_plan        VARCHAR(50) NOT NULL DEFAULT 'free',

  -- Metadata (flexible product-specific config)
  metadata        JSONB NOT NULL DEFAULT '{}',

  -- Feature flags (what modules are enabled)
  enabled_features JSONB NOT NULL DEFAULT '[]',

  -- Contact info
  admin_email     VARCHAR(320) NOT NULL,
  phone           VARCHAR(20),
  address         TEXT,

  -- Lifecycle
  trial_ends_at   TIMESTAMPTZ,
  suspended_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tenant_slug UNIQUE (slug)
);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_status ON tenants (status);
CREATE INDEX idx_tenants_stripe ON tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
