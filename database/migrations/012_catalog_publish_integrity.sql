BEGIN;

-- Published products must remain sellable: an active category, a resolved
-- shipping weight, and at least one active variant are required. These checks
-- are deferred so product + variant edits can complete in one transaction.
CREATE OR REPLACE FUNCTION check_published_product_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_id_to_check text;
  row_data record;
BEGIN
  product_id_to_check := CASE
    WHEN TG_TABLE_NAME = 'products' THEN COALESCE(NEW.id, OLD.id)
    WHEN TG_TABLE_NAME = 'variants' THEN COALESCE(NEW.product_id, OLD.product_id)
    ELSE NULL
  END;

  IF product_id_to_check IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id, p.status, p.shipping_weight_grams,
         c.active AS category_active,
         c.default_shipping_weight_grams
  INTO row_data
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.id = product_id_to_check;

  -- Product may have been deleted in the same transaction.
  IF NOT FOUND OR row_data.status <> 'published' THEN
    RETURN NULL;
  END IF;

  IF row_data.category_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Published products require an active category.';
  END IF;

  IF row_data.shipping_weight_grams IS NULL
     AND row_data.default_shipping_weight_grams IS NULL THEN
    RAISE EXCEPTION 'Published products require a product shipping weight or category default shipping weight.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM variants v
    WHERE v.product_id = product_id_to_check AND v.active = true
  ) THEN
    RAISE EXCEPTION 'Published products require at least one active variant.';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS products_publish_integrity ON products;
CREATE CONSTRAINT TRIGGER products_publish_integrity
AFTER INSERT OR UPDATE ON products
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_published_product_integrity();

DROP TRIGGER IF EXISTS variants_publish_integrity ON variants;
CREATE CONSTRAINT TRIGGER variants_publish_integrity
AFTER INSERT OR UPDATE OR DELETE ON variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_published_product_integrity();

CREATE OR REPLACE FUNCTION check_category_publish_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active IS NOT TRUE AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.category_id = NEW.id AND p.status = 'published'
  ) THEN
    RAISE EXCEPTION 'Move or unpublish products before disabling this category.';
  END IF;

  IF NEW.default_shipping_weight_grams IS NULL AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.category_id = NEW.id
      AND p.status = 'published'
      AND p.shipping_weight_grams IS NULL
  ) THEN
    RAISE EXCEPTION 'Published products rely on this category shipping weight. Add product overrides or keep the category default.';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS categories_publish_integrity ON categories;
CREATE CONSTRAINT TRIGGER categories_publish_integrity
AFTER UPDATE ON categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_category_publish_integrity();

-- Homepage sections use polymorphic reference_id values instead of foreign
-- keys. Prevent deleting live referenced catalogue content and leaving a
-- broken enabled homepage section behind.
CREATE OR REPLACE FUNCTION protect_enabled_homepage_reference_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM homepage_sections h
    WHERE h.enabled = true AND h.reference_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This item is used by an enabled homepage section. Disable or change that section before deleting it.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS products_protect_homepage_reference ON products;
CREATE TRIGGER products_protect_homepage_reference
BEFORE DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION protect_enabled_homepage_reference_delete();

DROP TRIGGER IF EXISTS categories_protect_homepage_reference ON categories;
CREATE TRIGGER categories_protect_homepage_reference
BEFORE DELETE ON categories
FOR EACH ROW
EXECUTE FUNCTION protect_enabled_homepage_reference_delete();

DROP TRIGGER IF EXISTS collections_protect_homepage_reference ON collections;
CREATE TRIGGER collections_protect_homepage_reference
BEFORE DELETE ON collections
FOR EACH ROW
EXECUTE FUNCTION protect_enabled_homepage_reference_delete();

INSERT INTO schema_migrations(version)
VALUES ('012_catalog_publish_integrity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
