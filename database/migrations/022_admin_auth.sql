BEGIN;

CREATE TABLE IF NOT EXISTS admin_auth (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  recovery_code_hash text,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version)
VALUES ('022_admin_auth')
ON CONFLICT(version) DO NOTHING;

COMMIT;
