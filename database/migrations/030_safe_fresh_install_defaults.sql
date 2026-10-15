BEGIN;

-- A brand-new database must not accept checkout before payment and delivery
-- settings are configured. Existing environments keep their current values.
INSERT INTO site_settings(key,value,updated_at)
VALUES
  ('ordersEnabled','false'::jsonb,now()),
  ('codEnabled','false'::jsonb,now()),
  ('bankEnabled','false'::jsonb,now())
ON CONFLICT(key) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('030_safe_fresh_install_defaults')
ON CONFLICT(version) DO NOTHING;

COMMIT;
