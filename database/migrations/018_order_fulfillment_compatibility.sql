BEGIN;

-- Preserve the legacy snapshot column while allowing the three current methods.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_pricing_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_pricing_mode_check
  CHECK (delivery_pricing_mode IN ('zone','flat','area_group','pickup'));

INSERT INTO schema_migrations(version) VALUES ('018_order_fulfillment_compatibility')
ON CONFLICT(version) DO NOTHING;
COMMIT;
