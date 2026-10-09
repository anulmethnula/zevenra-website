BEGIN;

CREATE OR REPLACE FUNCTION protect_active_preorder_product_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM preorders
    WHERE product_id = OLD.id
      AND status NOT IN ('cancelled', 'converted')
  ) THEN
    RAISE EXCEPTION 'Archive products with active pre-orders instead of deleting them.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS products_protect_active_preorders ON products;
CREATE TRIGGER products_protect_active_preorders
BEFORE DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION protect_active_preorder_product_delete();

CREATE OR REPLACE FUNCTION protect_active_preorder_variant_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM preorders
    WHERE variant_id = OLD.id
      AND status NOT IN ('cancelled', 'converted')
  ) THEN
    RAISE EXCEPTION 'A size or stock variant with an active pre-order cannot be removed.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS variants_protect_active_preorders ON variants;
CREATE TRIGGER variants_protect_active_preorders
BEFORE DELETE ON variants
FOR EACH ROW
EXECUTE FUNCTION protect_active_preorder_variant_delete();

INSERT INTO schema_migrations(version)
VALUES ('008_preorder_reference_integrity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
