BEGIN;

-- The admin product editor intentionally allows SKU to be left blank.
-- PostgreSQL UNIQUE treats repeated empty strings as duplicates, so the
-- original table-level UNIQUE constraint made the second blank SKU fail.
-- Keep non-empty SKUs unique while allowing multiple variants to omit SKU.
ALTER TABLE variants DROP CONSTRAINT IF EXISTS variants_sku_key;

CREATE UNIQUE INDEX IF NOT EXISTS variants_sku_nonblank_unique_idx
  ON variants(sku)
  WHERE btrim(sku) <> '';

COMMIT;
