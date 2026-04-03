CREATE SCHEMA IF NOT EXISTS gateway;

CREATE TABLE IF NOT EXISTS gateway.api_requests (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    plan        VARCHAR(50) NOT NULL,
    endpoint    VARCHAR(500) NOT NULL,
    method      VARCHAR(10) NOT NULL,
    status_code INT NOT NULL,
    request_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    flushed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_requests_tenant_id ON gateway.api_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_request_at ON gateway.api_requests(request_at);
