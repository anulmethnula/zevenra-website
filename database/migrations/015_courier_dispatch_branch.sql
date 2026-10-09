BEGIN;

ALTER TABLE courier_providers
  ADD COLUMN IF NOT EXISTS dispatch_branch text NOT NULL DEFAULT '';

ALTER TABLE courier_rates
  DROP CONSTRAINT IF EXISTS courier_rates_rate_card_id_destination_district_destination_city_key;

CREATE UNIQUE INDEX IF NOT EXISTS courier_rates_card_branch_destination_idx
  ON courier_rates(rate_card_id, lower(btrim(from_branch)), lower(btrim(destination_district)), lower(btrim(destination_city)));

INSERT INTO schema_migrations(version)
VALUES ('015_courier_dispatch_branch')
ON CONFLICT (version) DO NOTHING;

COMMIT;
