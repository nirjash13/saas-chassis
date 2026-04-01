SET search_path TO iam;

CREATE TABLE impersonation_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id     UUID NOT NULL REFERENCES users(id),
  target_user_id    UUID NOT NULL REFERENCES users(id),
  target_tenant_id  UUID NOT NULL,
  reason            TEXT NOT NULL,
  token_hash        VARCHAR(255) NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impersonation_admin ON impersonation_sessions (admin_user_id);
