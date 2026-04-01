SET search_path TO iam;

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID,           -- NULL = global/system role
  name            VARCHAR(50) NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,  -- Cannot be deleted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_role_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource        VARCHAR(50) NOT NULL,   -- e.g., 'users', 'ledger', 'tenants'
  action          VARCHAR(50) NOT NULL,   -- e.g., 'read', 'write', 'delete', 'manage'
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_permission UNIQUE (resource, action)
);

CREATE TABLE role_permissions (
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Seed system roles
INSERT INTO roles (id, tenant_id, name, display_name, is_system_role) VALUES
  ('a0000000-0000-0000-0000-000000000001', NULL, 'platform_admin', 'Platform Administrator', true),
  ('a0000000-0000-0000-0000-000000000002', NULL, 'tenant_admin', 'Tenant Administrator', true),
  ('a0000000-0000-0000-0000-000000000003', NULL, 'tenant_officer', 'Officer / Manager', true),
  ('a0000000-0000-0000-0000-000000000004', NULL, 'tenant_member', 'Member (Read Only)', true);

-- Seed core permissions
INSERT INTO permissions (resource, action, description) VALUES
  ('users', 'read', 'View user profiles'),
  ('users', 'write', 'Create/update users'),
  ('users', 'delete', 'Remove users'),
  ('users', 'manage', 'Full user management including role assignment'),
  ('tenants', 'read', 'View tenant details'),
  ('tenants', 'write', 'Update tenant settings'),
  ('tenants', 'manage', 'Full tenant management'),
  ('ledger', 'read', 'View financial entries'),
  ('ledger', 'write', 'Create/edit financial entries'),
  ('ledger', 'close', 'Close financial periods'),
  ('billing', 'read', 'View billing information'),
  ('billing', 'manage', 'Manage subscriptions'),
  ('audit', 'read', 'View audit logs'),
  ('reports', 'read', 'View reports'),
  ('reports', 'export', 'Export reports'),
  ('settings', 'read', 'View settings'),
  ('settings', 'write', 'Modify settings');

-- Map permissions to system roles
-- Platform Admin gets everything (enforced in code via is_platform_admin flag)
-- Tenant Admin
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 'a0000000-0000-0000-0000-000000000002', id FROM permissions
  WHERE (resource, action) IN (
    ('users','read'),('users','write'),('users','manage'),
    ('tenants','read'),('tenants','write'),
    ('ledger','read'),('ledger','write'),('ledger','close'),
    ('billing','read'),('billing','manage'),
    ('audit','read'),
    ('reports','read'),('reports','export'),
    ('settings','read'),('settings','write')
  );

-- Officer
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 'a0000000-0000-0000-0000-000000000003', id FROM permissions
  WHERE (resource, action) IN (
    ('users','read'),
    ('tenants','read'),
    ('ledger','read'),('ledger','write'),
    ('reports','read'),('reports','export'),
    ('settings','read')
  );

-- Member
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 'a0000000-0000-0000-0000-000000000004', id FROM permissions
  WHERE (resource, action) IN (
    ('tenants','read'),
    ('ledger','read'),
    ('reports','read')
  );
