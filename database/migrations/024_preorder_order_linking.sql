ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source_preorder_request_id text REFERENCES preorders(request_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_paid bigint CHECK (amount_paid IS NULL OR amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS amount_to_collect bigint CHECK (amount_to_collect IS NULL OR amount_to_collect >= 0);

ALTER TABLE preorders
  ADD COLUMN IF NOT EXISTS payment_receipt_public_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_receipt_resource_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_receipt_format text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_preorder_unique_idx
  ON orders(source_preorder_request_id)
  WHERE source_preorder_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_source_preorder_search_idx
  ON orders(source_preorder_request_id, created_at DESC);

UPDATE orders o
SET source_preorder_request_id = p.request_id,
    amount_paid = o.subtotal,
    amount_to_collect = o.delivery_fee
FROM preorders p
WHERE p.converted_order_id = o.order_id
  AND o.source = 'preorder'
  AND o.source_preorder_request_id IS NULL;

UPDATE preorders p
SET payment_receipt_public_id = o.payment_receipt_public_id,
    payment_receipt_resource_type = o.payment_receipt_resource_type,
    payment_receipt_format = o.payment_receipt_format
FROM orders o
WHERE p.converted_order_id = o.order_id
  AND p.payment_receipt_public_id = ''
  AND o.payment_receipt_public_id <> '';

UPDATE orders
SET payment_receipt_public_id = '',
    payment_receipt_resource_type = '',
    payment_receipt_format = ''
WHERE source_preorder_request_id IS NOT NULL
  AND payment_receipt_public_id <> '';

INSERT INTO schema_migrations(version)
VALUES ('024_preorder_order_linking')
ON CONFLICT(version) DO NOTHING;
