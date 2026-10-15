BEGIN;

-- Keep technical IDs stable for relationships, while giving staff/customers
-- simple permanent numbers that are easy to read, search, export and migrate.
CREATE SEQUENCE IF NOT EXISTS product_number_seq START WITH 200;
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 200;

-- Adding the default with the column backfills existing rows from the sequence
-- and keeps every future row automatic. Technical IDs remain unchanged.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_number bigint NOT NULL DEFAULT nextval('product_number_seq');
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number bigint NOT NULL DEFAULT nextval('order_number_seq');

ALTER SEQUENCE product_number_seq OWNED BY products.product_number;
ALTER SEQUENCE order_number_seq OWNED BY orders.order_number;

CREATE UNIQUE INDEX IF NOT EXISTS products_product_number_unique_idx
  ON products(product_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique_idx
  ON orders(order_number);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_number_check;
ALTER TABLE products ADD CONSTRAINT products_product_number_check
  CHECK (product_number >= 200);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_number_check
  CHECK (order_number >= 200);

-- Canonical catalogue hierarchy for the current ZEVENRA store.
-- Root categories stay in navigation; subcategories appear beneath their root.
UPDATE categories
SET show_in_navigation = true,
    sort_order = CASE slug WHEN 'women' THEN 1 WHEN 'men' THEN 2 WHEN 'accessories' THEN 3 ELSE sort_order END,
    updated_at = now()
WHERE parent_id IS NULL AND slug IN ('women','men','accessories');

UPDATE categories child
SET parent_id = parent.id,
    sort_order = 1,
    updated_at = now()
FROM categories parent
WHERE child.slug = 't-shirts'
  AND parent.slug = 'men'
  AND parent.parent_id IS NULL
  AND child.id <> parent.id;

UPDATE categories child
SET sort_order = 1,
    updated_at = now()
FROM categories parent
WHERE child.slug = 'crop-tops'
  AND parent.slug = 'women'
  AND child.parent_id = parent.id;

-- Products named as crop tops should live in the Crop Tops subcategory,
-- rather than directly on the WOMEN root category.
UPDATE products p
SET category_id = crop.id,
    updated_at = now()
FROM categories women, categories crop
WHERE women.slug = 'women'
  AND women.parent_id IS NULL
  AND crop.slug = 'crop-tops'
  AND crop.parent_id = women.id
  AND p.category_id = women.id
  AND lower(p.name) LIKE '%crop top%';

INSERT INTO schema_migrations(version)
VALUES ('031_public_numbers_catalog_cleanup')
ON CONFLICT(version) DO NOTHING;

COMMIT;
