BEGIN;

CREATE TABLE discount_codes (
  id text PRIMARY KEY,
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('percentage','fixed')),
  value numeric(12,2) NOT NULL CHECK (value > 0),
  minimum_subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal >= 0),
  maximum_discount numeric(12,2) CHECK (maximum_discount IS NULL OR maximum_discount > 0),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type='percentage' OR maximum_discount IS NULL),
  CHECK (type='fixed' OR value <= 100),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE UNIQUE INDEX discount_codes_normalized_code_idx ON discount_codes (upper(btrim(code)));

ALTER TABLE orders ADD COLUMN discount_code text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE orders ADD COLUMN discount_type text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD CONSTRAINT orders_discount_total_check CHECK (subtotal-discount_amount+delivery_fee=total);

INSERT INTO schema_migrations(version) VALUES ('005_discount_codes') ON CONFLICT (version) DO NOTHING;
COMMIT;
