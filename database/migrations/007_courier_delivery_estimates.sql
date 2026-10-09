BEGIN;

ALTER TABLE courier_providers
  ADD COLUMN IF NOT EXISTS minimum_delivery_days integer NOT NULL DEFAULT 2
    CHECK (minimum_delivery_days > 0),
  ADD COLUMN IF NOT EXISTS maximum_delivery_days integer NOT NULL DEFAULT 4
    CHECK (maximum_delivery_days >= minimum_delivery_days);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS minimum_delivery_days integer
    CHECK (minimum_delivery_days IS NULL OR minimum_delivery_days > 0),
  ADD COLUMN IF NOT EXISTS maximum_delivery_days integer
    CHECK (maximum_delivery_days IS NULL OR maximum_delivery_days >= minimum_delivery_days);

INSERT INTO schema_migrations(version)
VALUES ('007_courier_delivery_estimates')
ON CONFLICT (version) DO NOTHING;

COMMIT;
