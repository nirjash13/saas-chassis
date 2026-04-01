SET search_path TO iam;

-- A user's membership in a tenant with a specific role
CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,  -- FK to tenant_mgmt.tenants (cross-schema)
  role_id         UUID NOT NULL,  -- FK to roles table
  status          membership_status NOT NULL DEFAULT 'active',
  invited_by      UUID REFERENCES users(id),
  invited_at      TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_tenant UNIQUE (user_id, tenant_id)
);

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_memberships_user ON memberships (user_id);
CREATE INDEX idx_memberships_tenant ON memberships (tenant_id);
CREATE INDEX idx_memberships_role ON memberships (role_id);
