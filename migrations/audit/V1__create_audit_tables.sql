SET search_path TO audit;

-- Immutable audit log — no UPDATE or DELETE policies
CREATE TABLE entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  user_id         UUID,
  action          audit_action NOT NULL,
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     VARCHAR(255),
  description     TEXT,
  changes         JSONB,
  metadata        JSONB DEFAULT '{}',
  ip_address      INET,
  user_agent      VARCHAR(500),
  request_id      UUID,
  service_name    VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON entries (tenant_id);
CREATE INDEX idx_audit_user ON entries (user_id);
CREATE INDEX idx_audit_action ON entries (action);
CREATE INDEX idx_audit_resource ON entries (resource_type, resource_id);
CREATE INDEX idx_audit_created ON entries (created_at DESC);
CREATE INDEX idx_audit_tenant_date ON entries (tenant_id, created_at DESC);

-- RLS: tenants see their own audit logs; platform admin sees all
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_read_policy ON entries
  FOR SELECT
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

-- Anyone can INSERT (services write audit logs)
CREATE POLICY audit_write_policy ON entries
  FOR INSERT
  WITH CHECK (true);

-- NO update or delete policies — audit log is immutable
