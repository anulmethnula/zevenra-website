BEGIN;

CREATE TABLE IF NOT EXISTS fulfilment_couriers (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  tracking_url_template text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfilment_courier_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='orders_fulfilment_courier_id_fkey'
      AND conrelid='orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_fulfilment_courier_id_fkey
      FOREIGN KEY (fulfilment_courier_id) REFERENCES fulfilment_couriers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_fulfilment_courier_id_idx
  ON orders(fulfilment_courier_id) WHERE fulfilment_courier_id IS NOT NULL;

-- Preserve all order snapshot columns. Legacy provider IDs are deliberately not
-- migrated: they mixed checkout pricing with physical dispatch and may contain
-- test providers. Historical fulfilment_courier_name text remains untouched.
DELETE FROM site_settings WHERE key='defaultCourierProviderId';

DROP TABLE IF EXISTS courier_rates;
DROP TABLE IF EXISTS courier_rate_import_rows;
DROP TABLE IF EXISTS courier_rate_cards;
DROP TABLE IF EXISTS delivery_rates;
DROP TABLE IF EXISTS courier_providers;

INSERT INTO schema_migrations(version) VALUES ('028_delivery_architecture_cleanup')
ON CONFLICT(version) DO NOTHING;

COMMIT;
