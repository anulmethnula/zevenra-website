BEGIN;

-- Historical normal orders that were already delivered had inventory deducted at
-- order creation, so only the lifecycle marker was stale. Do not change stock qty.
UPDATE orders
SET stock_state='fulfilled', updated_at=now()
WHERE order_status='delivered'
  AND source_preorder_request_id IS NULL
  AND stock_state='reserved';

-- Delivered normal COD orders have completed collection. Preserve refund states.
UPDATE orders
SET payment_status='paid', updated_at=now()
WHERE order_status='delivered'
  AND source_preorder_request_id IS NULL
  AND payment_method='cod'
  AND lower(btrim(COALESCE(payment_status,'')))='cod';

CREATE OR REPLACE FUNCTION enforce_order_workflow_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  status_changed boolean := true;
  dispatch_changed boolean := true;
BEGIN
  IF TG_OP='UPDATE' THEN
    status_changed := OLD.order_status IS DISTINCT FROM NEW.order_status;
    dispatch_changed := status_changed
      OR OLD.fulfilment_courier_id IS DISTINCT FROM NEW.fulfilment_courier_id
      OR OLD.fulfilment_courier_name IS DISTINCT FROM NEW.fulfilment_courier_name
      OR OLD.courier_sent_date IS DISTINCT FROM NEW.courier_sent_date;
  END IF;

  IF NEW.order_status IN ('dispatched','delivered') AND dispatch_changed THEN
    IF NEW.fulfilment_courier_id IS NULL
       OR btrim(COALESCE(NEW.fulfilment_courier_name,''))=''
       OR NEW.courier_sent_date IS NULL THEN
      RAISE EXCEPTION 'Dispatch requires the actual courier and handover time.';
    END IF;
  END IF;

  IF NEW.order_status='delivered' AND status_changed AND NEW.source_preorder_request_id IS NULL THEN
    IF NEW.stock_state='reserved' THEN
      RAISE EXCEPTION 'Delivered inventory-backed orders must be fulfilled.';
    END IF;
    IF NEW.payment_method='cod' AND lower(btrim(COALESCE(NEW.payment_status,'')))<>'paid' THEN
      RAISE EXCEPTION 'Delivered COD orders must be marked paid.';
    END IF;
  END IF;

  IF NEW.order_status='cancelled' AND status_changed THEN
    IF NEW.cancelled_at IS NULL
       OR btrim(COALESCE(NEW.cancelled_by,''))=''
       OR btrim(COALESCE(NEW.cancellation_reason,''))=''
       OR NEW.cancelled_from_status NOT IN ('pending','confirmed') THEN
      RAISE EXCEPTION 'Cancellation metadata is incomplete.';
    END IF;
    IF TG_OP='UPDATE'
       AND (OLD.stock_state='reserved' OR (OLD.stock_state='not_applicable' AND OLD.source_preorder_request_id IS NOT NULL))
       AND NEW.stock_state<>'restored' THEN
      RAISE EXCEPTION 'Cancellation must release reserved inventory.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_workflow_integrity ON orders;
CREATE TRIGGER orders_workflow_integrity
BEFORE INSERT OR UPDATE OF order_status,stock_state,payment_status,fulfilment_courier_id,fulfilment_courier_name,courier_sent_date,cancelled_at,cancelled_by,cancellation_reason,cancelled_from_status
ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_workflow_integrity();

INSERT INTO schema_migrations(version)
VALUES ('034_order_financial_fulfilment_integrity')
ON CONFLICT(version) DO NOTHING;

COMMIT;
