SET search_path TO audit;

CREATE TABLE service_health (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name    VARCHAR(100) NOT NULL,
  status          VARCHAR(20) NOT NULL,
  response_time_ms INTEGER,
  details         JSONB DEFAULT '{}',
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_service_health UNIQUE (service_name)
);
