BEGIN;
CREATE INDEX IF NOT EXISTS products_updated_idx ON products(updated_at DESC);
CREATE INDEX IF NOT EXISTS products_category_status_idx ON products(category_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS variants_sku_lower_idx ON variants(lower(sku));
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status, created_at DESC);
INSERT INTO schema_migrations(version) VALUES ('003_query_performance') ON CONFLICT (version) DO NOTHING;
COMMIT;
