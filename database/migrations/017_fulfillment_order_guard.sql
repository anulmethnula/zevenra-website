BEGIN;

-- A checkout with no configured fulfilment path must never accept orders.
-- Do not guess a fee or branch merely to keep ordering enabled.
UPDATE site_settings
SET value='false'::jsonb, updated_at=now()
WHERE key='ordersEnabled'
  AND lower(value #>> '{}')='true'
  AND NOT EXISTS (SELECT 1 FROM delivery_methods WHERE active);

CREATE OR REPLACE FUNCTION guard_orders_require_fulfillment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.key='ordersEnabled' AND lower(NEW.value #>> '{}')='true'
     AND NOT EXISTS(SELECT 1 FROM delivery_methods WHERE active) THEN
    RAISE EXCEPTION 'At least one fulfillment method must be active before orders can be enabled.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_settings_fulfillment_guard ON site_settings;
CREATE TRIGGER site_settings_fulfillment_guard
BEFORE INSERT OR UPDATE OF value ON site_settings
FOR EACH ROW EXECUTE FUNCTION guard_orders_require_fulfillment();

INSERT INTO schema_migrations(version) VALUES ('017_fulfillment_order_guard')
ON CONFLICT(version) DO NOTHING;
COMMIT;
