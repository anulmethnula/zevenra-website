BEGIN;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS default_shipping_weight_grams integer
  CHECK (default_shipping_weight_grams IS NULL OR default_shipping_weight_grams > 0);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shipping_weight_grams integer
  CHECK (shipping_weight_grams IS NULL OR shipping_weight_grams > 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_product_weight_grams integer
  CHECK (total_product_weight_grams IS NULL OR total_product_weight_grams >= 0),
  ADD COLUMN IF NOT EXISTS total_shipping_weight_grams integer
  CHECK (total_shipping_weight_grams IS NULL OR total_shipping_weight_grams >= 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS shipping_weight_grams integer
  CHECK (shipping_weight_grams IS NULL OR shipping_weight_grams > 0);

INSERT INTO schema_migrations(version)
VALUES ('006_shipping_weights')
ON CONFLICT (version) DO NOTHING;

COMMIT;
