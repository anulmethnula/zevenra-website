BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
UPDATE orders SET order_status='dispatched' WHERE order_status IN ('sourcing','packed','shipped');
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('pending','confirmed','dispatched','delivered','cancelled'));

INSERT INTO schema_migrations(version) VALUES ('027_dispatched_order_status')
ON CONFLICT (version) DO NOTHING;

COMMIT;
