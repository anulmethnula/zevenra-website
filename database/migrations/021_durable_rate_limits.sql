BEGIN;

CREATE TABLE IF NOT EXISTS request_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS request_rate_limits_reset_at_idx ON request_rate_limits(reset_at);

INSERT INTO schema_migrations(version)
VALUES ('021_durable_rate_limits')
ON CONFLICT(version) DO NOTHING;

COMMIT;
