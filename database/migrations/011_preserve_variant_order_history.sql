BEGIN;

-- Variants are historical references for stock restoration, returns and RTOs.
-- If an admin removes a variant from a product edit, keep any referenced row
-- but make it inactive so it cannot be sold again. Unreferenced variants can
-- still be deleted normally.
CREATE OR REPLACE FUNCTION preserve_referenced_variant_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM order_items WHERE variant_id = OLD.id
  ) OR EXISTS (
    SELECT 1
    FROM preorders
    WHERE variant_id = OLD.id
      AND status NOT IN ('cancelled', 'converted')
  ) THEN
    UPDATE variants
    SET active = false,
        updated_at = now()
    WHERE id = OLD.id;
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS a_variants_preserve_references ON variants;
CREATE TRIGGER a_variants_preserve_references
BEFORE DELETE ON variants
FOR EACH ROW
EXECUTE FUNCTION preserve_referenced_variant_delete();

-- Product deletion is already blocked in the admin API when order history
-- exists. Keep the same invariant at the database layer as defense in depth.
CREATE OR REPLACE FUNCTION protect_order_history_product_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM order_items WHERE product_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Archive products referenced by order history instead of deleting them.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS a_products_protect_order_history ON products;
CREATE TRIGGER a_products_protect_order_history
BEFORE DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION protect_order_history_product_delete();

INSERT INTO schema_migrations(version)
VALUES ('011_preserve_variant_order_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
