BEGIN;

-- A CASE expression over polymorphic trigger records can resolve fields from
-- every branch. Products have `id`; variants have `product_id`, so select the
-- row shape procedurally before accessing table-specific fields.
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

  SELECT p.id,p.status,p.shipping_weight_grams,c.active AS category_active,c.default_shipping_weight_grams
    INTO row_data
    FROM products p JOIN categories c ON c.id=p.category_id
   WHERE p.id=product_id_to_check;
  IF NOT FOUND OR row_data.status<>'published' THEN RETURN NULL; END IF;
  IF row_data.category_active IS NOT TRUE THEN RAISE EXCEPTION 'Published products require an active category.'; END IF;
  IF row_data.shipping_weight_grams IS NULL AND row_data.default_shipping_weight_grams IS NULL THEN
    RAISE EXCEPTION 'Published products require a product shipping weight or category default shipping weight.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM variants v WHERE v.product_id=product_id_to_check AND v.active=true) THEN
    RAISE EXCEPTION 'Published products require at least one active variant.';
  END IF;
  RETURN NULL;
END;
$$;

INSERT INTO schema_migrations(version) VALUES ('019_product_integrity_trigger_row_shape')
ON CONFLICT(version) DO NOTHING;
COMMIT;
