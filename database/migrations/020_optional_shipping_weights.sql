BEGIN;

-- The current flat-rate, area-group, and pickup fulfillment methods do not
-- price customer delivery by weight. Retain weight fields for historical and
-- future use, but do not make them a publication requirement.
CREATE OR REPLACE FUNCTION validate_published_product_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_active boolean;
BEGIN
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;

  SELECT active INTO category_active
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
  RETURN NEW;
END;
$$;

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
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_published_product_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_id_to_check text;
  row_data record;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    product_id_to_check := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'variants' THEN
    product_id_to_check := COALESCE(NEW.product_id, OLD.product_id);
  ELSE
    RETURN NULL;
  END IF;

  IF product_id_to_check IS NULL THEN RETURN NULL; END IF;

  SELECT p.status, c.active AS category_active
    INTO row_data
    FROM products p
    JOIN categories c ON c.id = p.category_id
   WHERE p.id = product_id_to_check;

  IF NOT FOUND OR row_data.status <> 'published' THEN RETURN NULL; END IF;
  IF row_data.category_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Published products require an active category.';
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
  RETURN NULL;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('020_optional_shipping_weights')
ON CONFLICT(version) DO NOTHING;

COMMIT;
