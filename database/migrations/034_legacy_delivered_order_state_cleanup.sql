BEGIN;

-- Older rows created before the strict fulfilment workflow can still be
-- delivered while carrying the old reserved/not_applicable bookkeeping flag.
-- This only repairs deterministic bookkeeping; it does not invent courier data.
UPDATE orders o
SET stock_state = 'fulfilled',
    updated_at = now()
WHERE o.order_status = 'delivered'
  AND o.source_preorder_request_id IS NULL
  AND o.stock_state <> 'fulfilled'
  AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = o.order_id AND oi.is_preorder = true
  );

-- In the current workflow COD becomes paid when delivery is completed.
UPDATE orders
SET payment_status = 'paid',
    updated_at = now()
WHERE order_status = 'delivered'
  AND payment_method = 'cod'
  AND lower(COALESCE(payment_status, '')) NOT IN ('paid', 'refund pending', 'refunded', 'rejected');

INSERT INTO schema_migrations(version)
VALUES ('034_legacy_delivered_order_state_cleanup')
ON CONFLICT(version) DO NOTHING;

COMMIT;
