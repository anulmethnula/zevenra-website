BEGIN;

CREATE OR REPLACE FUNCTION ensure_variant_sku()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sku := btrim(COALESCE(NEW.sku, ''));
  IF NEW.sku = '' THEN
    NEW.sku := 'ZEV-AUTO-' || upper(regexp_replace(NEW.id, '[^A-Za-z0-9]', '', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variants_ensure_sku ON variants;
CREATE TRIGGER variants_ensure_sku
BEFORE INSERT OR UPDATE OF sku ON variants
FOR EACH ROW
EXECUTE FUNCTION ensure_variant_sku();

UPDATE variants
SET sku = 'ZEV-AUTO-' || upper(regexp_replace(id, '[^A-Za-z0-9]', '', 'g'))
WHERE btrim(COALESCE(sku, '')) = '';

CREATE OR REPLACE FUNCTION validate_published_product_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_active boolean;
  category_weight integer;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT active, default_shipping_weight_grams
  INTO category_active, category_weight
  FROM categories
  WHERE id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a valid category before publishing this product.'
      USING ERRCODE = '23514';
  END IF;

  IF category_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Activate the product category before publishing this product.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.shipping_weight_grams IS NULL AND category_weight IS NULL THEN
    RAISE EXCEPTION 'Configure a product shipping weight or category default before publishing.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_validate_publish_configuration ON products;
CREATE TRIGGER products_validate_publish_configuration
BEFORE INSERT OR UPDATE OF status, category_id, shipping_weight_grams ON products
FOR EACH ROW
EXECUTE FUNCTION validate_published_product_configuration();

CREATE OR REPLACE FUNCTION protect_published_category_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active IS NOT TRUE
     AND EXISTS (SELECT 1 FROM products p WHERE p.category_id = NEW.id AND p.status = 'published') THEN
    RAISE EXCEPTION 'Archive or move published products before disabling this category.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.default_shipping_weight_grams IS NULL
     AND EXISTS (
       SELECT 1
       FROM products p
       WHERE p.category_id = NEW.id
         AND p.status = 'published'
         AND p.shipping_weight_grams IS NULL
     ) THEN
    RAISE EXCEPTION 'Published products rely on this category shipping weight.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_protect_published_configuration ON categories;
CREATE TRIGGER categories_protect_published_configuration
BEFORE UPDATE OF active, default_shipping_weight_grams ON categories
FOR EACH ROW
EXECUTE FUNCTION protect_published_category_configuration();

INSERT INTO schema_migrations(version)
VALUES ('010_product_publish_integrity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
