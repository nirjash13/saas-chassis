-- ============================================================
-- Shared ENUM types and utility functions used across schemas
-- ============================================================

-- Tenant status lifecycle
CREATE TYPE tenant_status AS ENUM (
  'provisioning',
  'active',
  'suspended',
  'past_due',
  'cancelled',
  'archived'
);

-- User membership status within a tenant
CREATE TYPE membership_status AS ENUM (
  'invited',
  'active',
  'suspended',
  'removed'
);

-- Audit action types
CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'impersonate',
  'export',
  'config_change'
);

-- Standard timestamp columns function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
