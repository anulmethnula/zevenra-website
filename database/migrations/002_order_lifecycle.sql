BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_stock_state_check;
ALTER TABLE orders ADD CONSTRAINT orders_stock_state_check
  CHECK (stock_state IN ('reserved', 'fulfilled', 'restored', 'not_applicable'));

CREATE TABLE IF NOT EXISTS order_returns (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('customer_return', 'courier_rto')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'in_transit', 'received', 'completed', 'rejected')),
  reason text NOT NULL,
  notes text NOT NULL DEFAULT '',
  refund_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS order_return_items (
  id bigserial PRIMARY KEY,
  return_id text NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  order_item_id bigint NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  restockable boolean,
  restocked_at timestamptz,
  UNIQUE (return_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS order_returns_order_idx ON order_returns(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_returns_status_idx ON order_returns(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS order_return_items_return_idx ON order_return_items(return_id);

INSERT INTO schema_migrations(version) VALUES ('002_order_lifecycle')
ON CONFLICT (version) DO NOTHING;
COMMIT;
