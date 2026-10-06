BEGIN;

CREATE TABLE IF NOT EXISTS courier_rate_cards (
  id text PRIMARY KEY,
  courier_provider_id text NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','active','inactive')),
  source_file_name text NOT NULL,
  source_file_type text NOT NULL CHECK (source_file_type IN ('xlsx','csv')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  detected_headers jsonb NOT NULL DEFAULT '[]',
  column_mapping jsonb NOT NULL DEFAULT '{}',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  new_rows integer NOT NULL DEFAULT 0,
  changed_rows integer NOT NULL DEFAULT 0,
  UNIQUE(courier_provider_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS courier_rate_cards_one_active_idx
  ON courier_rate_cards(courier_provider_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS courier_rate_cards_provider_idx
  ON courier_rate_cards(courier_provider_id, imported_at DESC);

CREATE TABLE IF NOT EXISTS courier_rate_import_rows (
  id bigserial PRIMARY KEY,
  rate_card_id text NOT NULL REFERENCES courier_rate_cards(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','duplicate')),
  validation_errors text[] NOT NULL DEFAULT '{}',
  from_branch text NOT NULL DEFAULT '',
  destination_district text NOT NULL DEFAULT '',
  destination_city text NOT NULL DEFAULT '',
  first_kg_charge numeric(12,2),
  additional_kg_charge numeric(12,2),
  change_kind text NOT NULL DEFAULT '' CHECK (change_kind IN ('','new','changed','unchanged')),
  UNIQUE(rate_card_id, row_number)
);

CREATE INDEX IF NOT EXISTS courier_rate_import_rows_card_status_idx
  ON courier_rate_import_rows(rate_card_id, validation_status, row_number);

CREATE TABLE IF NOT EXISTS courier_rates (
  id bigserial PRIMARY KEY,
  rate_card_id text NOT NULL REFERENCES courier_rate_cards(id) ON DELETE CASCADE,
  courier_provider_id text NOT NULL REFERENCES courier_providers(id) ON DELETE CASCADE,
  from_branch text NOT NULL DEFAULT '',
  destination_district text NOT NULL,
  destination_city text NOT NULL,
  first_kg_charge numeric(12,2) NOT NULL CHECK (first_kg_charge >= 0),
  additional_kg_charge numeric(12,2) NOT NULL CHECK (additional_kg_charge >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rate_card_id, destination_district, destination_city)
);

CREATE INDEX IF NOT EXISTS courier_rates_card_destination_idx
  ON courier_rates(rate_card_id, lower(destination_district), lower(destination_city));
CREATE INDEX IF NOT EXISTS courier_rates_provider_idx
  ON courier_rates(courier_provider_id, rate_card_id);

INSERT INTO schema_migrations(version)
VALUES ('004_courier_rate_cards')
ON CONFLICT (version) DO NOTHING;

COMMIT;
