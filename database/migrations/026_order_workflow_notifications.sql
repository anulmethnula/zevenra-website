BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_from_status text;
UPDATE orders SET cancelled_at=COALESCE(cancelled_at,updated_at),cancelled_by=COALESCE(NULLIF(cancelled_by,''),'legacy'),cancellation_reason=COALESCE(NULLIF(cancellation_reason,''),'Legacy cancellation'),cancelled_from_status=COALESCE(NULLIF(cancelled_from_status,''),'pending') WHERE order_status='cancelled';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
UPDATE orders SET order_status='dispatched' WHERE order_status IN ('sourcing','packed','shipped');
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check CHECK (order_status IN ('pending','confirmed','dispatched','delivered','cancelled'));
CREATE TABLE IF NOT EXISTS admin_notifications (
  id bigserial PRIMARY KEY,type text NOT NULL,title text NOT NULL,description text NOT NULL DEFAULT '',href text NOT NULL,
  entity_type text NOT NULL,entity_id text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx ON admin_notifications(read_at,created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_entity_idx ON admin_notifications(entity_type,entity_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES ('026_order_workflow_notifications') ON CONFLICT (version) DO NOTHING;
COMMIT;
